//! Pengujian unit untuk sistem MIDI & Keyboard mapping.

#[cfg(test)]
mod midi_unit_tests {
    use crate::midi::keyboard::KeyboardManager;
    use crate::midi::mapping::{
        MidiMappingManager, FACTORY_PRESET_HERCULES, FACTORY_PRESET_PIONEER,
    };
    use crate::midi::types::{
        DjAction, JogWheelMode, KeyboardBinding, MidiEvent, MidiMessageType,
    };

    #[test]
    fn test_midi_event_parse_note_on_off() {
        // Note On channel 0, note 60, velocity 100
        let bytes = [0x90, 60, 100];
        let ev = MidiEvent::parse(&bytes).expect("harus bisa di-parse");
        assert_eq!(ev.channel, 0);
        assert_eq!(ev.message_type, MidiMessageType::NoteOn);
        assert_eq!(ev.control, 60);
        assert_eq!(ev.value, 100);

        // Note On velocity 0 harus dianggap sebagai NoteOff
        let bytes_vel0 = [0x90, 60, 0];
        let ev_vel0 = MidiEvent::parse(&bytes_vel0).expect("harus bisa di-parse");
        assert_eq!(ev_vel0.message_type, MidiMessageType::NoteOff);
        assert_eq!(ev_vel0.value, 0);

        // Explicit Note Off channel 2, note 72, velocity 64
        let bytes_off = [0x82, 72, 64];
        let ev_off = MidiEvent::parse(&bytes_off).expect("harus bisa di-parse");
        assert_eq!(ev_off.channel, 2);
        assert_eq!(ev_off.message_type, MidiMessageType::NoteOff);
        assert_eq!(ev_off.control, 72);
        assert_eq!(ev_off.value, 64);
    }

    #[test]
    fn test_midi_event_parse_cc_and_pitch_bend() {
        // Control Change channel 1, CC 33, value 65
        let bytes_cc = [0xB1, 33, 65];
        let ev_cc = MidiEvent::parse(&bytes_cc).expect("harus bisa di-parse");
        assert_eq!(ev_cc.channel, 1);
        assert_eq!(ev_cc.message_type, MidiMessageType::ControlChange);
        assert_eq!(ev_cc.control, 33);
        assert_eq!(ev_cc.value, 65);

        // Pitch Bend channel 0 (center 8192 -> msb 64, lsb 0)
        let bytes_pb = [0xE0, 0x00, 0x40];
        let ev_pb = MidiEvent::parse(&bytes_pb).expect("harus bisa di-parse");
        assert_eq!(ev_pb.channel, 0);
        assert_eq!(ev_pb.message_type, MidiMessageType::PitchBend);
        assert_eq!(ev_pb.value, 64);
    }

    #[test]
    fn test_midi_event_to_bytes() {
        let ev = MidiEvent {
            channel: 0,
            message_type: MidiMessageType::NoteOn,
            control: 11,
            value: 127,
        };
        let bytes = ev.to_bytes();
        assert_eq!(bytes, vec![0x90, 11, 127]);

        let ev_cc = MidiEvent {
            channel: 1,
            message_type: MidiMessageType::ControlChange,
            control: 7,
            value: 64,
        };
        assert_eq!(ev_cc.to_bytes(), vec![0xB1, 7, 64]);
    }

    #[test]
    fn test_jog_wheel_decoding() {
        // Two's Complement
        let mode_twos = JogWheelMode::RelativeTwoComp;
        assert_eq!(mode_twos.decode_delta(0x01), 1.0);
        assert_eq!(mode_twos.decode_delta(0x05), 5.0);
        assert_eq!(mode_twos.decode_delta(0x7F), -1.0);
        assert_eq!(mode_twos.decode_delta(0x7E), -2.0);

        // Binary Offset (center = 64)
        let mode_bin = JogWheelMode::RelativeBinaryOffset;
        assert_eq!(mode_bin.decode_delta(64), 0.0);
        assert_eq!(mode_bin.decode_delta(67), 3.0);
        assert_eq!(mode_bin.decode_delta(61), -3.0);

        // Signed Bit (bit 6 = sign, 0..63 = mag)
        let mode_sign = JogWheelMode::RelativeSignedBit;
        assert_eq!(mode_sign.decode_delta(0x01), 1.0);
        assert_eq!(mode_sign.decode_delta(0x04), 4.0);
        assert_eq!(mode_sign.decode_delta(0x41), -1.0);
        assert_eq!(mode_sign.decode_delta(0x44), -4.0);
    }

    #[test]
    fn test_mapping_manager_factory_presets() {
        let mut mgr = MidiMappingManager::new(None);
        assert_eq!(mgr.active_preset(), FACTORY_PRESET_PIONEER);

        // Cari Play Deck 1 (Ch 0, Note 11)
        let ev_play_d1 = MidiEvent {
            channel: 0,
            message_type: MidiMessageType::NoteOn,
            control: 11,
            value: 127,
        };
        let (_, action) = mgr.process_event(&ev_play_d1);
        assert_eq!(action, Some(DjAction::DeckPlay { deck: 0 }));

        // Cari Cue Deck 2 (Ch 1, Note 12)
        let ev_cue_d2 = MidiEvent {
            channel: 1,
            message_type: MidiMessageType::NoteOn,
            control: 12,
            value: 127,
        };
        let (_, action) = mgr.process_event(&ev_cue_d2);
        assert_eq!(action, Some(DjAction::DeckCue { deck: 1 }));

        // Ganti ke preset Hercules
        mgr.load_preset(FACTORY_PRESET_HERCULES).unwrap();
        assert_eq!(mgr.active_preset(), FACTORY_PRESET_HERCULES);

        let ev_herc_play = MidiEvent {
            channel: 0,
            message_type: MidiMessageType::NoteOn,
            control: 1,
            value: 127,
        };
        let (_, action) = mgr.process_event(&ev_herc_play);
        assert_eq!(action, Some(DjAction::DeckPlay { deck: 0 }));
    }

    #[test]
    fn test_midi_learn_workflow() {
        let mut mgr = MidiMappingManager::new(None);
        mgr.clear_mappings();

        // Mulai learn untuk MixerCrossfader
        mgr.start_learn(DjAction::MixerCrossfader);
        assert!(mgr.learn_status().is_learning);

        // Kirim event CC 15 channel 0 value 64
        let learn_event = MidiEvent {
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 15,
            value: 64,
        };

        let (new_map, learned_action) = mgr.process_event(&learn_event);
        assert!(new_map.is_some());
        assert_eq!(learned_action, Some(DjAction::MixerCrossfader));
        assert!(!mgr.learn_status().is_learning);

        // Pastikan sekarang event CC 15 channel 0 terpetakan ke MixerCrossfader
        let normal_event = MidiEvent {
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 15,
            value: 100,
        };
        let (_, resolved_action) = mgr.process_event(&normal_event);
        assert_eq!(resolved_action, Some(DjAction::MixerCrossfader));
    }

    #[test]
    fn test_keyboard_manager() {
        let mut kb = KeyboardManager::new();

        // Space tanpa modifier = Deck 1 Play
        let act1 = kb.find_action("Space", false, false, false);
        assert_eq!(act1, Some(DjAction::DeckPlay { deck: 0 }));

        // Shift + Space = Deck 2 Play
        let act2 = kb.find_action("Space", false, true, false);
        assert_eq!(act2, Some(DjAction::DeckPlay { deck: 1 }));

        // Case insensitivity test
        let act_c = kb.find_action("C", false, false, false);
        assert_eq!(act_c, Some(DjAction::DeckCue { deck: 0 }));

        // Custom binding
        kb.set_binding(KeyboardBinding {
            key: "m".to_string(),
            ctrl: true,
            shift: false,
            alt: false,
            action: DjAction::MixerMasterVolume,
            description: Some("Master Vol".to_string()),
        });

        assert_eq!(
            kb.find_action("m", true, false, false),
            Some(DjAction::MixerMasterVolume)
        );

        // Remove binding
        assert!(kb.remove_binding("m", true, false, false));
        assert_eq!(kb.find_action("m", true, false, false), None);
    }
}
