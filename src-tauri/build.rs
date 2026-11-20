fn main() {
    #[cfg(target_os = "linux")]
    {
        use std::path::Path;
        let shim_dir = Path::new("/tmp/pkgshim/lib");
        if !shim_dir.exists() {
            let _ = std::fs::create_dir_all(shim_dir);
            for search_dir in &["/usr/lib/x86_64-linux-gnu", "/lib/x86_64-linux-gnu"] {
                if let Ok(entries) = std::fs::read_dir(search_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                            if let Some(idx) = file_name.find(".so.") {
                                let soname = format!("{}.so", &file_name[..idx]);
                                let link = shim_dir.join(&soname);
                                if !link.exists() {
                                    let _ = std::os::unix::fs::symlink(&path, &link);
                                }
                            }
                        }
                    }
                }
            }
        }
        println!("cargo:rustc-link-search=native=/tmp/pkgshim/lib");
    }

    tauri_build::build()
}
