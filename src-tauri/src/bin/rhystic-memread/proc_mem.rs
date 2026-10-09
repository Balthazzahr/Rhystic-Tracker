use std::fs::{self, File};
use std::io;
use std::os::unix::fs::FileExt;

const MONO_DLL: &str = "mono-2.0-bdwgc.dll";
const CAP_SYS_PTRACE: u32 = 19;

/// Read access to another process's address space through `/proc/<pid>/mem`.
/// Opening it is where the kernel runs the ptrace-attach check, so a successful
/// `open` is the real answer to "do we have permission".
pub struct Process {
    mem: File,
}

impl Process {
    pub fn open(pid: u32) -> io::Result<Self> {
        Ok(Self { mem: File::open(format!("/proc/{pid}/mem"))? })
    }

    pub fn read(&self, addr: u64, buf: &mut [u8]) -> io::Result<()> {
        self.mem.read_exact_at(buf, addr)
    }
}

pub struct Mtga {
    pub pid: u32,
    pub mono_base: u64,
}

/// Finds the Arena client: the process with MTGA.exe on its command line that
/// has the Mono runtime mapped. Proton's launcher processes also carry MTGA.exe
/// in their arguments, which is why the mapping is the deciding check.
pub fn find_mtga() -> Option<Mtga> {
    fs::read_dir("/proc").ok()?.flatten().find_map(|entry| {
        let pid: u32 = entry.file_name().to_str()?.parse().ok()?;
        let cmdline = fs::read(format!("/proc/{pid}/cmdline")).ok()?;
        if !cmdline.windows(8).any(|w| w == b"MTGA.exe") {
            return None;
        }
        let maps = fs::read_to_string(format!("/proc/{pid}/maps")).ok()?;
        let mono_base = mono_image_base(&maps)?;
        Some(Mtga { pid, mono_base })
    })
}

/// Lowest address the Mono DLL is mapped at, which is where Wine put the PE
/// image header.
fn mono_image_base(maps: &str) -> Option<u64> {
    maps.lines()
        .filter(|l| l.ends_with(MONO_DLL))
        .filter_map(|l| u64::from_str_radix(l.split('-').next()?, 16).ok())
        .min()
}

/// `None` when Yama isn't built into the kernel, which means plain same-user
/// ptrace rules apply.
pub fn ptrace_scope() -> Option<u8> {
    fs::read_to_string("/proc/sys/kernel/yama/ptrace_scope").ok()?.trim().parse().ok()
}

pub fn has_cap_sys_ptrace() -> bool {
    fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            let hex = s.lines().find_map(|l| l.strip_prefix("CapEff:"))?.trim().to_string();
            u64::from_str_radix(&hex, 16).ok()
        })
        .is_some_and(|caps| caps & (1 << CAP_SYS_PTRACE) != 0)
}

pub enum Attach {
    Ok,
    Denied,
    /// Yama mode 3 disables ptrace attach for everyone until reboot; no
    /// capability gets past it.
    Impossible,
}

impl Attach {
    /// What attaching will do once Arena is running, from the same rules the
    /// kernel applies. Mode 1 only lets ancestors attach, and the game is a
    /// child of Steam, not of us — so in practice 1 and 2 both need the cap.
    pub fn predict(scope: Option<u8>, cap: bool) -> Self {
        match scope {
            None | Some(0) => Attach::Ok,
            Some(1 | 2) if cap => Attach::Ok,
            Some(1 | 2) => Attach::Denied,
            Some(_) => Attach::Impossible,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Attach::Ok => "ok",
            Attach::Denied => "denied",
            Attach::Impossible => "impossible",
        }
    }
}
