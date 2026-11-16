//! Utilitas gain: konversi dBFS ↔ linear untuk trim, fader, dan meter.

/// Batas bawah meter/gain agar nilai log tidak menuju negatif tak hingga.
pub const MIN_DB: f32 = -60.0;

/// Konversi dBFS ke gain linear.
pub fn db_to_linear(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

/// Konversi gain linear ke dBFS (dibatasi agar meter tidak meledak).
pub fn linear_to_db(linear: f32) -> f32 {
    if !linear.is_finite() || linear <= 1.0e-6 {
        MIN_DB
    } else {
        (20.0 * linear.log10()).clamp(MIN_DB, 24.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversion_is_reversible() {
        for db in [-60.0_f32, -24.0, -12.0, -6.0, 0.0] {
            let linear = db_to_linear(db);
            assert!((linear_to_db(linear) - db).abs() < 0.001, "db = {db}");
        }
    }

    #[test]
    fn zero_and_negative_are_floored() {
        assert_eq!(linear_to_db(0.0), MIN_DB);
        assert!(db_to_linear(-60.0) > 0.0);
    }
}
