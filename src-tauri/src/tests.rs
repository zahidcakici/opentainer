use super::*;

// ── validate_docker_id ────────────────────────────────────────────

#[test]
fn validate_docker_id_accepts_short_hex() {
    assert!(validate_docker_id("abc123def456").is_ok());
}

#[test]
fn validate_docker_id_accepts_full_sha() {
    let sha = "a".repeat(64);
    assert!(validate_docker_id(&sha).is_ok());
}

#[test]
fn validate_docker_id_accepts_image_with_tag() {
    assert!(validate_docker_id("nginx:latest").is_ok());
}

#[test]
fn validate_docker_id_accepts_image_with_registry() {
    assert!(validate_docker_id("ghcr.io/user/image:v1.2.3").is_ok());
}

#[test]
fn validate_docker_id_accepts_digest_ref() {
    assert!(validate_docker_id("nginx@sha256:abc123").is_ok());
}

#[test]
fn validate_docker_id_accepts_name_with_underscores() {
    assert!(validate_docker_id("my_volume-name.v2").is_ok());
}

#[test]
fn validate_docker_id_rejects_empty() {
    let err = validate_docker_id("").unwrap_err();
    assert!(err.contains("empty"));
}

#[test]
fn validate_docker_id_rejects_too_long() {
    let long = "x".repeat(257);
    let err = validate_docker_id(&long).unwrap_err();
    assert!(err.contains("too long"));
}

#[test]
fn validate_docker_id_rejects_semicolon() {
    assert!(validate_docker_id("nginx; rm -rf /").is_err());
}

#[test]
fn validate_docker_id_rejects_backtick() {
    assert!(validate_docker_id("nginx`whoami`").is_err());
}

#[test]
fn validate_docker_id_rejects_dollar_sign() {
    assert!(validate_docker_id("$HOME").is_err());
}

#[test]
fn validate_docker_id_rejects_pipe() {
    assert!(validate_docker_id("nginx | cat /etc/passwd").is_err());
}

// ── CommandResponse helpers ───────────────────────────────────────

#[test]
fn command_response_ok_sets_fields() {
    let resp = CommandResponse::ok(42);
    assert!(resp.success);
    assert_eq!(resp.data, Some(42));
    assert!(resp.error.is_none());
}

#[test]
fn command_response_ok_empty_sets_fields() {
    let resp: CommandResponse<()> = CommandResponse::ok_empty();
    assert!(resp.success);
    assert!(resp.data.is_none());
    assert!(resp.error.is_none());
}

#[test]
fn command_response_err_sets_fields() {
    let resp: CommandResponse<()> = CommandResponse::err("something broke");
    assert!(!resp.success);
    assert!(resp.data.is_none());
    assert_eq!(resp.error, Some("something broke".to_string()));
}
