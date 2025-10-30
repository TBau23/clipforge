/// Parse frame rate string like "30/1" or "30000/1001"
pub fn parse_frame_rate(rate_str: &str) -> Option<f64> {
    let parts: Vec<&str> = rate_str.split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    
    let num: f64 = parts[0].parse().ok()?;
    let den: f64 = parts[1].parse().ok()?;
    
    if den == 0.0 {
        return None;
    }
    
    Some(num / den)
}

/// Parse FFmpeg time format (hh:mm:ss.xx) to milliseconds
pub fn parse_ffmpeg_time(time_str: &str) -> Option<u64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    
    let total_seconds = hours * 3600.0 + minutes * 60.0 + seconds;
    Some((total_seconds * 1000.0) as u64)
}

/// Calculate thumbnail time (10% of duration, clamped between 500ms and 5s)
pub fn calculate_thumbnail_time(duration_ms: u64) -> u64 {
    let ten_percent = duration_ms / 10;
    ten_percent.max(500).min(5000)
}

