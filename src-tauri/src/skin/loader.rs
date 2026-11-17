//! Pengelola pemuatan, penyimpanan, ekspor, dan impor template skin DJDeX.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use super::manifest::SkinManifest;

pub const FACTORY_SKIN_CLASSIC: &str = "classic-club";
pub const FACTORY_SKIN_BATTLE: &str = "battle-scratch";
pub const FACTORY_SKIN_REMIX: &str = "producer-remix";
pub const FACTORY_SKIN_TOUR: &str = "tour-pro";

/// Manajer utama sistem skin & tata letak aplikasi DJDeX.
#[derive(Debug, Clone)]
pub struct SkinManager {
    active_skin: SkinManifest,
    custom_skins: Vec<SkinManifest>,
    skins_dir: PathBuf,
}

impl Default for SkinManager {
    fn default() -> Self {
        Self::new(default_skins_dir())
    }
}

pub fn default_skins_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("djdex").join("skins")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("djdex")
            .join("skins")
    } else {
        PathBuf::from("skins")
    }
}

impl SkinManager {
    /// Inisialisasi manajer skin dengan folder penyimpanan skin pengguna.
    pub fn new(skins_dir: PathBuf) -> Self {
        let mut mgr = Self {
            active_skin: SkinManifest::classic_club(),
            custom_skins: Vec::new(),
            skins_dir,
        };
        mgr.reload_custom_skins();
        mgr
    }

    /// Memuat ulang seluruh file skin kustom (.json / .toml) dari folder disk.
    pub fn reload_custom_skins(&mut self) {
        self.custom_skins.clear();
        if !self.skins_dir.exists() {
            let _ = fs::create_dir_all(&self.skins_dir);
            return;
        }

        if let Ok(entries) = fs::read_dir(&self.skins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if ext == "json" {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(manifest) = SkinManifest::from_json(&content) {
                                self.add_custom_manifest(manifest);
                            }
                        }
                    } else if ext == "toml" {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(manifest) = SkinManifest::from_toml(&content) {
                                self.add_custom_manifest(manifest);
                            }
                        }
                    }
                }
            }
        }
    }

    fn add_custom_manifest(&mut self, manifest: SkinManifest) {
        // Jangan duplikat ID factory
        let id = &manifest.metadata.id;
        if id == FACTORY_SKIN_CLASSIC
            || id == FACTORY_SKIN_BATTLE
            || id == FACTORY_SKIN_REMIX
            || id == FACTORY_SKIN_TOUR
        {
            return;
        }
        self.custom_skins.retain(|s| s.metadata.id != *id);
        self.custom_skins.push(manifest);
    }

    /// Mengambil seluruh daftar skin yang tersedia (4 preset pabrikan + skin kustom).
    pub fn list_skins(&self) -> Vec<SkinManifest> {
        let mut list = vec![
            SkinManifest::classic_club(),
            SkinManifest::battle_scratch(),
            SkinManifest::producer_remix(),
            SkinManifest::tour_pro(),
        ];
        list.extend(self.custom_skins.clone());
        list
    }

    /// Mengambil skin yang sedang aktif saat ini.
    pub fn get_active_skin(&self) -> SkinManifest {
        self.active_skin.clone()
    }

    /// Mengganti skin aktif berdasarkan ID.
    pub fn set_active_skin(&mut self, skin_id: &str) -> Result<SkinManifest, String> {
        match skin_id {
            FACTORY_SKIN_CLASSIC => {
                self.active_skin = SkinManifest::classic_club();
                Ok(self.active_skin.clone())
            }
            FACTORY_SKIN_BATTLE => {
                self.active_skin = SkinManifest::battle_scratch();
                Ok(self.active_skin.clone())
            }
            FACTORY_SKIN_REMIX => {
                self.active_skin = SkinManifest::producer_remix();
                Ok(self.active_skin.clone())
            }
            FACTORY_SKIN_TOUR => {
                self.active_skin = SkinManifest::tour_pro();
                Ok(self.active_skin.clone())
            }
            custom_id => {
                if let Some(found) = self
                    .custom_skins
                    .iter()
                    .find(|s| s.metadata.id == custom_id)
                {
                    self.active_skin = found.clone();
                    Ok(self.active_skin.clone())
                } else {
                    Err(format!("Skin dengan ID '{}' tidak ditemukan", skin_id))
                }
            }
        }
    }

    /// Menyimpan atau memperbarui skin kustom ke folder pengguna.
    pub fn save_custom_skin(&mut self, manifest: SkinManifest) -> Result<SkinManifest, String> {
        let id = &manifest.metadata.id;
        if id.is_empty() {
            return Err("ID skin tidak boleh kosong".to_string());
        }

        // Pastikan tidak menimpa skin bawaan
        if id == FACTORY_SKIN_CLASSIC
            || id == FACTORY_SKIN_BATTLE
            || id == FACTORY_SKIN_REMIX
            || id == FACTORY_SKIN_TOUR
        {
            return Err("Tidak dapat menimpa skin bawaan pabrik".to_string());
        }

        fs::create_dir_all(&self.skins_dir)
            .map_err(|e| format!("Gagal membuat folder skins: {}", e))?;

        let file_path = self.skins_dir.join(format!("{}.json", id));
        let json = manifest.to_json()?;
        fs::write(&file_path, json).map_err(|e| format!("Gagal menulis file skin: {}", e))?;

        self.add_custom_manifest(manifest.clone());
        self.active_skin = manifest.clone();

        Ok(manifest)
    }

    /// Menghapus skin kustom.
    pub fn delete_skin(&mut self, skin_id: &str) -> Result<(), String> {
        if skin_id == FACTORY_SKIN_CLASSIC
            || skin_id == FACTORY_SKIN_BATTLE
            || skin_id == FACTORY_SKIN_REMIX
            || skin_id == FACTORY_SKIN_TOUR
        {
            return Err("Skin pabrikan bawaan tidak dapat dihapus".to_string());
        }

        let json_path = self.skins_dir.join(format!("{}.json", skin_id));
        let toml_path = self.skins_dir.join(format!("{}.toml", skin_id));

        if json_path.exists() {
            let _ = fs::remove_file(json_path);
        }
        if toml_path.exists() {
            let _ = fs::remove_file(toml_path);
        }

        self.custom_skins.retain(|s| s.metadata.id != skin_id);

        if self.active_skin.metadata.id == skin_id {
            self.active_skin = SkinManifest::classic_club();
        }

        Ok(())
    }

    /// Ekspor paket skin menjadi arsip ZIP (.djdex-skin) yang berisi manifest.json.
    pub fn export_skin_pack(&self, skin_id: &str, destination_path: &Path) -> Result<(), String> {
        let manifest = self
            .list_skins()
            .into_iter()
            .find(|s| s.metadata.id == skin_id)
            .ok_or_else(|| format!("Skin '{}' tidak ditemukan untuk diekspor", skin_id))?;

        let file = File::create(destination_path)
            .map_err(|e| format!("Gagal membuat file export: {}", e))?;
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        // Tulis skin.json
        let json_content = manifest.to_json()?;
        zip.start_file("skin.json", options)
            .map_err(|e| format!("Gagal menulis skin.json ke zip: {}", e))?;
        zip.write_all(json_content.as_bytes())
            .map_err(|e| format!("Gagal menulis data skin.json: {}", e))?;

        // Tulis skin.toml untuk kompatibilitas alternatif
        if let Ok(toml_content) = manifest.to_toml() {
            let _ = zip.start_file("skin.toml", options);
            let _ = zip.write_all(toml_content.as_bytes());
        }

        zip.finish()
            .map_err(|e| format!("Gagal menyelesaikan arsip zip: {}", e))?;

        Ok(())
    }

    /// Impor paket skin dari file .djdex-skin (.zip).
    pub fn import_skin_pack(&mut self, zip_path: &Path) -> Result<SkinManifest, String> {
        let file =
            File::open(zip_path).map_err(|e| format!("Gagal membuka file skin pack: {}", e))?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Format arsip skin tidak valid: {}", e))?;

        // Cari skin.json atau manifest.json atau skin.toml
        let mut target_name = None;
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                let name = file.name();
                if name == "skin.json" || name == "manifest.json" || name == "skin.toml" {
                    target_name = Some(name.to_string());
                    break;
                }
            }
        }

        let Some(fname) = target_name else {
            return Err("Arsip tidak berisi file 'skin.json' atau 'skin.toml'".to_string());
        };

        let is_toml = fname.ends_with(".toml");
        let mut content = String::new();
        archive
            .by_name(&fname)
            .map_err(|e| format!("Gagal mengakses file {}: {}", fname, e))?
            .read_to_string(&mut content)
            .map_err(|e| format!("Gagal membaca isi {}: {}", fname, e))?;

        let mut manifest = if is_toml {
            SkinManifest::from_toml(&content)?
        } else {
            SkinManifest::from_json(&content)?
        };

        // Jika ID bentrok dengan factory skin bawaan, beri akhiran '-imported'
        let id = &manifest.metadata.id;
        if id == FACTORY_SKIN_CLASSIC
            || id == FACTORY_SKIN_BATTLE
            || id == FACTORY_SKIN_REMIX
            || id == FACTORY_SKIN_TOUR
        {
            manifest.metadata.id = format!("{}-imported", id);
            manifest.metadata.name = format!("{} (Imported)", manifest.metadata.name);
        }

        // Simpan ke direktori skins
        self.save_custom_skin(manifest)
    }
}
