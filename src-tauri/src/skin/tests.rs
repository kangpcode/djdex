//! Pengujian unit untuk sistem Skin dan Template DJDeX.

#[cfg(test)]
mod skin_unit_tests {
    use crate::skin::loader::{
        SkinManager, FACTORY_SKIN_BATTLE, FACTORY_SKIN_CLASSIC, FACTORY_SKIN_REMIX,
        FACTORY_SKIN_TOUR,
    };
    use crate::skin::manifest::{PlatterSize, SkinManifest, WaveformOrientation, WaveformPosition};
    use std::fs;

    #[test]
    fn test_factory_skins_initialization() {
        let skins = [
            SkinManifest::classic_club(),
            SkinManifest::battle_scratch(),
            SkinManifest::producer_remix(),
            SkinManifest::tour_pro(),
        ];

        assert_eq!(skins.len(), 4);
        assert_eq!(skins[0].metadata.id, FACTORY_SKIN_CLASSIC);
        assert_eq!(skins[0].layout.deck_count, 2);
        assert_eq!(
            skins[0].layout.waveform.position,
            WaveformPosition::TopStacked
        );

        assert_eq!(skins[1].metadata.id, FACTORY_SKIN_BATTLE);
        assert_eq!(skins[1].layout.platter.size, PlatterSize::LargeBattle);
        assert_eq!(
            skins[1].layout.waveform.orientation,
            WaveformOrientation::Vertical
        );

        assert_eq!(skins[2].metadata.id, FACTORY_SKIN_REMIX);
        assert!(skins[2].layout.show_scratch_pads);

        assert_eq!(skins[3].metadata.id, FACTORY_SKIN_TOUR);
        assert_eq!(skins[3].layout.deck_count, 2);
        assert_eq!(skins[3].layout.waveform.height_px, 164);
        assert_eq!(skins[3].layout.mixer.channel_count, 2);
    }

    #[test]
    fn test_manifest_json_roundtrip() {
        let original = SkinManifest::classic_club();
        let json = original.to_json().expect("harus bisa serialize ke JSON");
        let parsed = SkinManifest::from_json(&json).expect("harus bisa parse dari JSON");

        assert_eq!(parsed.metadata.id, original.metadata.id);
        assert_eq!(parsed.theme.primary_color, original.theme.primary_color);
        assert_eq!(parsed.layout.deck_count, original.layout.deck_count);
        assert_eq!(parsed.layout.platter.size, original.layout.platter.size);
    }

    #[test]
    fn test_manifest_toml_roundtrip() {
        let original = SkinManifest::battle_scratch();
        let toml_str = original.to_toml().expect("harus bisa serialize ke TOML");
        let parsed = SkinManifest::from_toml(&toml_str).expect("harus bisa parse dari TOML");

        assert_eq!(parsed.metadata.id, original.metadata.id);
        assert_eq!(parsed.theme.primary_color, original.theme.primary_color);
        assert_eq!(
            parsed.layout.waveform.orientation,
            WaveformOrientation::Vertical
        );
    }

    #[test]
    fn test_skin_manager_switching() {
        let temp_dir = std::env::temp_dir().join("djdex_test_skins_switch");
        let _ = fs::create_dir_all(&temp_dir);

        let mut mgr = SkinManager::new(temp_dir.clone());
        assert_eq!(mgr.get_active_skin().metadata.id, FACTORY_SKIN_CLASSIC);

        let switched = mgr.set_active_skin(FACTORY_SKIN_BATTLE).unwrap();
        assert_eq!(switched.metadata.id, FACTORY_SKIN_BATTLE);
        assert_eq!(mgr.get_active_skin().metadata.id, FACTORY_SKIN_BATTLE);

        let tour = mgr.set_active_skin(FACTORY_SKIN_TOUR).unwrap();
        assert_eq!(tour.layout.deck_count, 2);
        assert_eq!(tour.layout.waveform.height_px, 164);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_custom_skin_and_delete() {
        let temp_dir = std::env::temp_dir().join("djdex_test_skins_custom");
        let _ = fs::create_dir_all(&temp_dir);

        let mut mgr = SkinManager::new(temp_dir.clone());
        let mut custom = SkinManifest::classic_club();
        custom.metadata.id = "neon-cyberpunk".to_string();
        custom.metadata.name = "Neon Cyberpunk".to_string();
        custom.theme.primary_color = "#39ff14".to_string();

        let saved = mgr.save_custom_skin(custom).expect("harus berhasil simpan");
        assert_eq!(saved.metadata.id, "neon-cyberpunk");
        assert_eq!(mgr.get_active_skin().metadata.id, "neon-cyberpunk");

        // Periksa daftar skin
        let list = mgr.list_skins();
        assert!(list.iter().any(|s| s.metadata.id == "neon-cyberpunk"));

        // Hapus skin kustom
        mgr.delete_skin("neon-cyberpunk")
            .expect("harus berhasil hapus");
        assert!(!mgr
            .list_skins()
            .iter()
            .any(|s| s.metadata.id == "neon-cyberpunk"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_and_import_skin_pack() {
        let temp_dir = std::env::temp_dir().join("djdex_test_skins_pack");
        let _ = fs::create_dir_all(&temp_dir);

        let mgr = SkinManager::new(temp_dir.clone());
        let pack_path = temp_dir.join("test_pack.djdex-skin");

        mgr.export_skin_pack(FACTORY_SKIN_REMIX, &pack_path)
            .expect("harus berhasil ekspor skin pack");
        assert!(pack_path.exists());

        // Impor ke manager baru
        let import_dir = temp_dir.join("imported");
        let mut mgr_import = SkinManager::new(import_dir);
        let imported = mgr_import
            .import_skin_pack(&pack_path)
            .expect("harus berhasil impor skin pack");

        let expected_id = format!("{}-imported", FACTORY_SKIN_REMIX);
        assert_eq!(imported.metadata.id, expected_id);
        assert_eq!(mgr_import.get_active_skin().metadata.id, expected_id);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
