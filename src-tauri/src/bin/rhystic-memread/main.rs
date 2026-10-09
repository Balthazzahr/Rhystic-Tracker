//! `rhystic-memread` — reads the player's card collection out of a running MTG
//! Arena client, the way Untapped.gg's companion does: read-only access to the
//! process's memory, nothing injected, no game files touched.
//!
//! It is a separate binary rather than part of the app because reading another
//! process's memory needs `CAP_SYS_PTRACE` on most distros (Yama
//! `ptrace_scope=1`). Granting that capability to the whole Tauri app would hand
//! it to WebKit too, and file capabilities put a binary in secure-exec mode, where
//! GLib ignores `GIO_EXTRA_MODULES` and breaks the webview's TLS on some setups.
//! So the privileged part stays this small, std-only, auditable program.
//!
//! Output is a single JSON object on stdout:
//!   `rhystic-memread status`     → what access we have right now
//!   `rhystic-memread collection` → `{"ok":true,"cards":{"<grpId>":count,...}}`
//!                                  or `{"ok":false,"error":"<kind>","detail":"..."}`

#[cfg(target_os = "linux")]
mod mono;
#[cfg(target_os = "linux")]
mod proc_mem;

fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(target_os = "linux")]
fn json_opt<T: std::fmt::Display>(v: Option<T>) -> String {
    v.map_or_else(|| "null".to_string(), |v| v.to_string())
}

#[cfg(target_os = "linux")]
fn status() -> String {
    use proc_mem::{Attach, find_mtga, has_cap_sys_ptrace, ptrace_scope};

    let scope = ptrace_scope();
    let cap = has_cap_sys_ptrace();
    let mtga = find_mtga();
    let attach = match &mtga {
        Some(m) => match proc_mem::Process::open(m.pid) {
            Ok(_) => Attach::Ok,
            Err(_) => match Attach::predict(scope, cap) {
                Attach::Impossible => Attach::Impossible,
                _ => Attach::Denied,
            },
        },
        None => Attach::predict(scope, cap),
    };
    format!(
        r#"{{"os":"linux","ptrace_scope":{},"cap_sys_ptrace":{},"mtga_pid":{},"attach":{}}}"#,
        json_opt(scope),
        cap,
        json_opt(mtga.map(|m| m.pid)),
        json_str(attach.as_str()),
    )
}

#[cfg(target_os = "linux")]
fn collection() -> String {
    match read_collection() {
        Ok(cards) => {
            let body = cards
                .iter()
                .map(|(grp, n)| format!("\"{grp}\":{n}"))
                .collect::<Vec<_>>()
                .join(",");
            format!(r#"{{"ok":true,"cards":{{{body}}}}}"#)
        }
        Err(e) => format!(
            r#"{{"ok":false,"error":{},"detail":{}}}"#,
            json_str(e.kind()),
            json_str(&e.to_string())
        ),
    }
}

#[cfg(target_os = "linux")]
fn read_collection() -> Result<Vec<(u32, i32)>, mono::WalkError> {
    use mono::WalkError;

    let mtga = proc_mem::find_mtga().ok_or(WalkError::NotRunning)?;
    let process = proc_mem::Process::open(mtga.pid).map_err(|e| WalkError::PermissionDenied(e.to_string()))?;
    let rt = mono::Runtime::attach(&process, mtga.mono_base)?;

    // WrapperController.Instance.InventoryManager.InventoryServiceWrapper.Cards
    // — verified against client 2026.63.20 (Unity 6000.3.14f1). The same chain is
    // what mtga-tracker-daemon walks, and what a BepInEx hook on
    // AwsInventoryServiceWrapper.set_Cards observes.
    let controller = rt.find_class("Core", "", "WrapperController")?;
    let instance = rt.static_object(controller, "<Instance>k__BackingField")?.ok_or(WalkError::NotLoggedIn)?;
    let inventory = rt.object_field(instance, "<InventoryManager>k__BackingField")?.ok_or(WalkError::NotLoggedIn)?;
    let service = rt.object_field(inventory, "InventoryServiceWrapper")?.ok_or(WalkError::NotLoggedIn)?;
    let cards = rt.object_field(service, "<Cards>k__BackingField")?.ok_or(WalkError::NotLoggedIn)?;
    let entries = rt.dictionary_u32_i32(cards)?;

    // The client initialises Cards to an empty dictionary and fills it after
    // login. An empty read means "not yet", never "you own nothing" — callers
    // treat the snapshot as authoritative, so this must not wipe a collection.
    if entries.is_empty() {
        return Err(WalkError::NotLoggedIn);
    }
    Ok(entries)
}

#[cfg(not(target_os = "linux"))]
fn status() -> String {
    format!(r#"{{"os":{},"ptrace_scope":null,"cap_sys_ptrace":false,"mtga_pid":null,"attach":"unsupported"}}"#, json_str(std::env::consts::OS))
}

#[cfg(not(target_os = "linux"))]
fn collection() -> String {
    r#"{"ok":false,"error":"unsupported","detail":"memory reading is only implemented for Linux"}"#.to_string()
}

fn main() {
    let out = match std::env::args().nth(1).as_deref() {
        Some("status") => status(),
        Some("collection") => collection(),
        _ => {
            eprintln!("usage: rhystic-memread <status|collection>");
            std::process::exit(2);
        }
    };
    println!("{out}");
}
