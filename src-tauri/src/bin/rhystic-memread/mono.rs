//! Walks the Mono runtime's own data structures in a foreign process to reach
//! managed objects by class and field *name*. Names are checked at every hop, so
//! a layout change after a game update surfaces as "class/field not found"
//! rather than as garbage numbers.
//!
//! Offsets are for 64-bit `mono-2.0-bdwgc.dll` as shipped by Unity 2021.3
//! through 6000.3 (struct definitions: mono/metadata/class-private-definition.h,
//! domain-internals.h, metadata-internals.h in Unity's mono fork).

use crate::proc_mem::Process;
use std::fmt;

// MonoDomain
const DOMAIN_ASSEMBLIES: u64 = 0xa0; // GSList* domain_assemblies
// MonoAssembly
const ASSEMBLY_NAME: u64 = 0x10; // aname.name
const ASSEMBLY_IMAGE: u64 = 0x60;
// MonoImage
const IMAGE_CLASS_CACHE: u64 = 0x4d0; // MonoInternalHashTable
const HASH_SIZE: u64 = 0x18;
const HASH_TABLE: u64 = 0x20;
// MonoClass
const CLASS_KIND: u64 = 0x1b;
const CLASS_PARENT: u64 = 0x30;
const CLASS_NAME: u64 = 0x48;
const CLASS_NAMESPACE: u64 = 0x50;
const CLASS_VTABLE_SIZE: u64 = 0x5c;
const CLASS_FIELDS: u64 = 0x98;
const CLASS_RUNTIME_INFO: u64 = 0xd0;
const CLASS_GENERIC_CLASS: u64 = 0xf0; // MonoClassGenericInst only
const CLASS_FIELD_COUNT: u64 = 0x100; // MonoClassDef and subtypes
const CLASS_NEXT_CACHE: u64 = 0x108;
const KIND_GINST: u8 = 3;
// MonoClassField
const FIELD_SIZE: u64 = 0x20;
const FIELD_TYPE: u64 = 0x0;
const FIELD_NAME: u64 = 0x8;
const FIELD_OFFSET: u64 = 0x18;
// MonoType
const TYPE_ATTRS: u64 = 0x8;
const FIELD_ATTR_STATIC: u16 = 0x10;
const FIELD_ATTR_LITERAL: u16 = 0x40;
// MonoClassRuntimeInfo → domain_vtables[0], MonoVTable
const RUNTIME_INFO_VTABLES: u64 = 0x8;
const VTABLE_METHODS: u64 = 0x48;
// MonoArray
const ARRAY_LENGTH: u64 = 0x18;
const ARRAY_DATA: u64 = 0x20;

#[derive(Debug)]
pub enum WalkError {
    NotRunning,
    PermissionDenied(String),
    NotLoggedIn,
    /// The memory doesn't look like what we expect: the game updated, or we
    /// raced the client mid-write. Retrying fixes the second; the first needs a
    /// code update.
    Layout(String),
    Read(u64),
}

impl WalkError {
    pub fn kind(&self) -> &'static str {
        match self {
            WalkError::NotRunning => "not_running",
            WalkError::PermissionDenied(_) => "permission_denied",
            WalkError::NotLoggedIn => "not_logged_in",
            WalkError::Layout(_) => "layout",
            WalkError::Read(_) => "read",
        }
    }
}

impl fmt::Display for WalkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WalkError::NotRunning => write!(f, "MTG Arena is not running"),
            WalkError::PermissionDenied(e) => write!(f, "cannot open the Arena process's memory: {e}"),
            WalkError::NotLoggedIn => write!(f, "Arena has not loaded the collection yet (log in first)"),
            WalkError::Layout(e) => write!(f, "unexpected memory layout: {e}"),
            WalkError::Read(addr) => write!(f, "read failed at {addr:#x}"),
        }
    }
}

type Result<T> = std::result::Result<T, WalkError>;

#[derive(Clone, Copy)]
pub struct Class(u64);

#[derive(Clone, Copy)]
pub struct Object(u64);

struct Field {
    offset: i32,
    attrs: u16,
}

pub struct Runtime<'p> {
    p: &'p Process,
    domain: u64,
}

impl<'p> Runtime<'p> {
    pub fn attach(p: &'p Process, mono_base: u64) -> Result<Self> {
        let mut rt = Runtime { p, domain: 0 };
        let get_root_domain = rt.pe_export(mono_base, "mono_get_root_domain")?;
        // The function is `mov rax, [rip+disp32]; ret`; the operand is the
        // global holding the root domain.
        let mut code = [0u8; 8];
        rt.read(get_root_domain, &mut code)?;
        if code[..3] != [0x48, 0x8b, 0x05] || code[7] != 0xc3 {
            return Err(WalkError::Layout(format!("mono_get_root_domain prologue {code:02x?}")));
        }
        let disp = i32::from_le_bytes(code[3..7].try_into().unwrap());
        let global = (get_root_domain as i64 + 7 + disp as i64) as u64;
        rt.domain = rt.ptr(global)?;
        if rt.domain == 0 {
            return Err(WalkError::NotLoggedIn);
        }
        Ok(rt)
    }

    fn read(&self, addr: u64, buf: &mut [u8]) -> Result<()> {
        self.p.read(addr, buf).map_err(|_| WalkError::Read(addr))
    }

    fn bytes<const N: usize>(&self, addr: u64) -> Result<[u8; N]> {
        let mut b = [0u8; N];
        self.read(addr, &mut b)?;
        Ok(b)
    }

    fn u8(&self, addr: u64) -> Result<u8> {
        Ok(self.bytes::<1>(addr)?[0])
    }
    fn u16(&self, addr: u64) -> Result<u16> {
        Ok(u16::from_le_bytes(self.bytes(addr)?))
    }
    fn i32(&self, addr: u64) -> Result<i32> {
        Ok(i32::from_le_bytes(self.bytes(addr)?))
    }
    fn u32(&self, addr: u64) -> Result<u32> {
        Ok(u32::from_le_bytes(self.bytes(addr)?))
    }
    fn ptr(&self, addr: u64) -> Result<u64> {
        Ok(u64::from_le_bytes(self.bytes(addr)?))
    }

    fn cstr(&self, addr: u64) -> Result<String> {
        if addr == 0 {
            return Ok(String::new());
        }
        // Names we compare against are short; 256 bytes covers compiler-generated
        // ones like `<InventoryManager>k__BackingField` with room to spare.
        let mut buf = [0u8; 256];
        // A string near the end of a mapping can make the full read fail, so
        // fall back to smaller chunks.
        for len in [256usize, 64, 16] {
            if self.read(addr, &mut buf[..len]).is_ok() {
                let end = buf[..len].iter().position(|&b| b == 0).unwrap_or(len);
                return Ok(String::from_utf8_lossy(&buf[..end]).into_owned());
            }
        }
        Err(WalkError::Read(addr))
    }

    fn pe_export(&self, base: u64, name: &str) -> Result<u64> {
        if self.u16(base)? != 0x5a4d {
            return Err(WalkError::Layout("mono DLL mapping has no MZ header".into()));
        }
        let nt = base + self.u32(base + 0x3c)? as u64;
        if self.u32(nt)? != 0x4550 {
            return Err(WalkError::Layout("mono DLL has no PE header".into()));
        }
        // PE32+ optional header starts at nt+0x18; its data directory at +0x70,
        // and entry 0 is the export table.
        let export_dir = base + self.u32(nt + 0x18 + 0x70)? as u64;
        let count = self.u32(export_dir + 0x18)?;
        let functions = base + self.u32(export_dir + 0x1c)? as u64;
        let names = base + self.u32(export_dir + 0x20)? as u64;
        let ordinals = base + self.u32(export_dir + 0x24)? as u64;
        for i in 0..count as u64 {
            let name_addr = base + self.u32(names + i * 4)? as u64;
            if self.cstr(name_addr)? == name {
                let ordinal = self.u16(ordinals + i * 2)? as u64;
                return Ok(base + self.u32(functions + ordinal * 4)? as u64);
            }
        }
        Err(WalkError::Layout(format!("export {name} not found")))
    }

    fn image(&self, assembly_name: &str) -> Result<u64> {
        let mut node = self.ptr(self.domain + DOMAIN_ASSEMBLIES)?;
        while node != 0 {
            let assembly = self.ptr(node)?;
            if assembly != 0 && self.cstr(self.ptr(assembly + ASSEMBLY_NAME)?)? == assembly_name {
                return self.ptr(assembly + ASSEMBLY_IMAGE);
            }
            node = self.ptr(node + 8)?;
        }
        Err(WalkError::Layout(format!("assembly {assembly_name} not loaded")))
    }

    pub fn find_class(&self, assembly: &str, namespace: &str, name: &str) -> Result<Class> {
        let image = self.image(assembly)?;
        let size = self.u32(image + IMAGE_CLASS_CACHE + HASH_SIZE)? as u64;
        let table = self.ptr(image + IMAGE_CLASS_CACHE + HASH_TABLE)?;
        for bucket in 0..size {
            let mut class = self.ptr(table + bucket * 8)?;
            while class != 0 {
                if self.cstr(self.ptr(class + CLASS_NAME)?)? == name
                    && self.cstr(self.ptr(class + CLASS_NAMESPACE)?)? == namespace
                {
                    return Ok(Class(class));
                }
                class = self.ptr(class + CLASS_NEXT_CACHE)?;
            }
        }
        Err(WalkError::Layout(format!("class {namespace}.{name} not found in {assembly}")))
    }

    fn class_of(&self, obj: Object) -> Result<Class> {
        // MonoObject.vtable → MonoVTable.klass, both at offset 0.
        Ok(Class(self.ptr(self.ptr(obj.0)?)?))
    }

    /// Searches the class and its ancestors, since inherited fields (like
    /// InventoryManagerCore.InventoryServiceWrapper) live on the base class.
    fn field(&self, mut class: Class, name: &str) -> Result<Field> {
        let start = class;
        while class.0 != 0 {
            // A generic instance's own field array is filled lazily; its
            // definition always has the count, and its fields when ours are null.
            let def = if self.u8(class.0 + CLASS_KIND)? & 0x7 == KIND_GINST {
                Class(self.ptr(self.ptr(class.0 + CLASS_GENERIC_CLASS)?)?)
            } else {
                class
            };
            let count = self.i32(def.0 + CLASS_FIELD_COUNT)?.max(0) as u64;
            let mut fields = self.ptr(class.0 + CLASS_FIELDS)?;
            if fields == 0 {
                fields = self.ptr(def.0 + CLASS_FIELDS)?;
            }
            for i in 0..if fields == 0 { 0 } else { count } {
                let f = fields + i * FIELD_SIZE;
                if self.cstr(self.ptr(f + FIELD_NAME)?)? == name {
                    let attrs = self.u16(self.ptr(f + FIELD_TYPE)? + TYPE_ATTRS)?;
                    return Ok(Field { offset: self.i32(f + FIELD_OFFSET)?, attrs });
                }
            }
            class = Class(self.ptr(class.0 + CLASS_PARENT)?);
        }
        let class_name = self.cstr(self.ptr(start.0 + CLASS_NAME)?)?;
        Err(WalkError::Layout(format!("field {class_name}.{name} not found")))
    }

    /// `Ok(None)` when the class hasn't been initialised or the field is null —
    /// both just mean the client hasn't got that far yet.
    pub fn static_object(&self, class: Class, name: &str) -> Result<Option<Object>> {
        let field = self.field(class, name)?;
        if field.attrs & FIELD_ATTR_STATIC == 0 || field.attrs & FIELD_ATTR_LITERAL != 0 {
            return Err(WalkError::Layout(format!("{name} is not a static field")));
        }
        let runtime_info = self.ptr(class.0 + CLASS_RUNTIME_INFO)?;
        if runtime_info == 0 {
            return Ok(None);
        }
        let vtable = self.ptr(runtime_info + RUNTIME_INFO_VTABLES)?;
        if vtable == 0 {
            return Ok(None);
        }
        // Static storage hangs off the slot just past the method table.
        let vtable_size = self.i32(class.0 + CLASS_VTABLE_SIZE)?.max(0) as u64;
        let statics = self.ptr(vtable + VTABLE_METHODS + vtable_size * 8)?;
        if statics == 0 {
            return Ok(None);
        }
        self.nullable(self.ptr(statics + field.offset as u64)?)
    }

    pub fn object_field(&self, obj: Object, name: &str) -> Result<Option<Object>> {
        let field = self.field(self.class_of(obj)?, name)?;
        if field.attrs & FIELD_ATTR_STATIC != 0 {
            return Err(WalkError::Layout(format!("{name} is static, expected an instance field")));
        }
        // Instance field offsets already include the MonoObject header.
        self.nullable(self.ptr(obj.0 + field.offset as u64)?)
    }

    fn nullable(&self, addr: u64) -> Result<Option<Object>> {
        Ok((addr != 0).then_some(Object(addr)))
    }

    fn instance_i32(&self, obj: Object, name: &str) -> Result<i32> {
        let field = self.field(self.class_of(obj)?, name)?;
        self.i32(obj.0 + field.offset as u64)
    }

    /// Reads a `Dictionary<uint, int>` (corefx layout: `_entries` of
    /// `{int hashCode; int next; uint key; int value}`, free slots have a
    /// negative hashCode).
    pub fn dictionary_u32_i32(&self, dict: Object) -> Result<Vec<(u32, i32)>> {
        // Two passes over the counters bracket the bulk read: if the client
        // mutated the dictionary in between, the snapshot may be torn.
        let version = self.instance_i32(dict, "_version")?;
        let count = self.instance_i32(dict, "_count")?;
        let free = self.instance_i32(dict, "_freeCount")?;
        let Some(entries) = self.object_field(dict, "_entries")? else {
            return Ok(Vec::new());
        };
        let len = self.ptr(entries.0 + ARRAY_LENGTH)?;
        if count < 0 || free < 0 || free > count || count as u64 > len {
            return Err(WalkError::Layout(format!("dictionary counters count={count} free={free} len={len}")));
        }

        const ENTRY: usize = 16;
        let mut raw = vec![0u8; count as usize * ENTRY];
        self.read(entries.0 + ARRAY_DATA, &mut raw)?;

        if self.instance_i32(dict, "_version")? != version {
            return Err(WalkError::Layout("collection changed while reading, retry".into()));
        }

        let cards: Vec<(u32, i32)> = raw
            .chunks_exact(ENTRY)
            .filter(|e| i32::from_le_bytes(e[0..4].try_into().unwrap()) >= 0)
            .map(|e| {
                (
                    u32::from_le_bytes(e[8..12].try_into().unwrap()),
                    i32::from_le_bytes(e[12..16].try_into().unwrap()),
                )
            })
            .collect();
        if cards.len() != (count - free) as usize {
            return Err(WalkError::Layout(format!("{} live entries, expected {}", cards.len(), count - free)));
        }
        Ok(cards)
    }
}
