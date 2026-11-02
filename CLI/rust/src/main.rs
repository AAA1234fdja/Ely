//! ely-rs — cliente Rust de la API local de Ely Cowork.
//!
//! Solo biblioteca estándar (sin crates). Habla HTTP/1.1 en claro contra el
//! servidor de `ely serve` (por defecto 127.0.0.1:8765), que es quien firma las
//! peticiones a los proveedores con la API Key. Así el token del modelo nunca
//! viaja por este cliente.
//!
//! ```text
//! cargo run -- health
//! cargo run -- profiles
//! cargo run -- ask "resume el repo" dev local
//! cargo run -- get /api/stats
//! ```
use std::env;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::ExitCode;
use std::time::Duration;

const DEFAULT_HOST: &str = "127.0.0.1:8765";
const TIMEOUT: Duration = Duration::from_secs(120);

struct Response {
    status: u16,
    body: String,
}

fn connect(host: &str) -> Result<TcpStream, String> {
    let stream = TcpStream::connect(host)
        .map_err(|e| format!("No se pudo conectar con {host}: {e}. ¿Está activo `ely serve`?"))?;
    let _ = stream.set_read_timeout(Some(TIMEOUT));
    let _ = stream.set_write_timeout(Some(TIMEOUT));
    Ok(stream)
}

fn request(host: &str, method: &str, path: &str, body: Option<&str>) -> Result<Response, String> {
    let mut stream = connect(host)?;
    let payload = body.unwrap_or("");
    let mut req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\nAccept: application/json\r\nUser-Agent: ely-rs/0.9.0\r\n"
    );
    if body.is_some() {
        req.push_str("Content-Type: application/json\r\n");
        req.push_str(&format!("Content-Length: {}\r\n", payload.as_bytes().len()));
    }
    req.push_str("\r\n");
    req.push_str(payload);

    stream
        .write_all(req.as_bytes())
        .map_err(|e| format!("Error escribiendo la petición: {e}"))?;
    stream.flush().ok();

    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|e| format!("Error leyendo la respuesta: {e}"))?;

    let split = find_subslice(&raw, b"\r\n\r\n").ok_or("Respuesta HTTP inválida")?;
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let body_bytes = &raw[split + 4..];

    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or("No se pudo leer el código de estado")?;

    let mut decoded = decode_chunked(body_bytes);
    if decoded.is_empty() {
        decoded = body_bytes.to_vec();
    }
    Ok(Response { status, body: String::from_utf8_lossy(&decoded).to_string() })
}

fn decode_chunked(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut index = 0usize;
    loop {
        let Some(line_end) = find_subslice(&input[index..], b"\r\n") else { break };
        let header = String::from_utf8_lossy(&input[index..index + line_end]).to_string();
        let size = usize::from_str_radix(header.trim().split(';').next().unwrap_or("0").trim(), 16);
        let Ok(size) = size else { break };
        if size == 0 {
            break;
        }
        let start = index + line_end + 2;
        if start + size > input.len() {
            break;
        }
        out.extend_from_slice(&input[start..start + size]);
        index = start + size + 2;
    }
    out
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    (0..=haystack.len() - needle.len()).find(|&i| &haystack[i..i + needle.len()] == needle)
}

fn json_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push(' '),
            c => out.push(c),
        }
    }
    out
}

/* Extrae el campo de texto de la respuesta de /api/chat sin depender de serde:
   busca "text": "..." y decodifica los escapes básicos. */
fn extract_field(body: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\"");
    let start = body.find(&needle)? + needle.len();
    let rest = &body[start..];
    let colon = rest.find(':')?;
    let mut chars = rest[colon + 1..].chars().peekable();
    while matches!(chars.peek(), Some(c) if c.is_whitespace()) {
        chars.next();
    }
    if chars.peek() != Some(&'"') {
        return None;
    }
    chars.next();
    let mut out = String::new();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => return Some(out),
            '\\' => match chars.next() {
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some('r') => out.push('\r'),
                Some('u') => {
                    let hex: String = (0..4).filter_map(|_| chars.next()).collect();
                    if let Ok(code) = u32::from_str_radix(&hex, 16) {
                        if let Some(c) = char::from_u32(code) {
                            out.push(c);
                        }
                    }
                }
                Some(other) => out.push(other),
                None => break,
            },
            other => out.push(other),
        }
    }
    None
}

fn print_profiles(body: &str) {
    println!("{:<12} {:<34} {:<18} {}", "ID", "MODELO", "CLAVE", "ENDPOINT");
    println!("{}", "─".repeat(104));
    for chunk in body.split("\"id\": \"").skip(1) {
        let id = chunk.split('"').next().unwrap_or("?");
        let model = extract_field(chunk, "model").unwrap_or_default();
        let masked = extract_field(chunk, "masked_key").unwrap_or_default();
        let url = extract_field(chunk, "base_url").unwrap_or_default();
        println!("{id:<12} {model:<34} {:<18} {}", if masked.is_empty() { "sin clave" } else { &masked }, url);
    }
    println!();
}

fn usage() {
    println!(
        "\
ely-rs · cliente Rust de Ely Cowork

  ely-rs health                      estado del servidor
  ely-rs profiles                    perfiles y claves enmascaradas
  ely-rs agents                      agentes y system prompts
  ely-rs ask <texto> [agente] [perfil]
  ely-rs get <ruta>                  p. ej. get /api/stats
  ely-rs post <ruta> <json>

Servidor: {}  (variable ELY_HOST para cambiarlo)
Este cliente no maneja claves: el backend Python firma las peticiones.",
        DEFAULT_HOST
    );
}

fn main() -> ExitCode {
    let host = env::var("ELY_HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string());
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage();
        return ExitCode::SUCCESS;
    };

    let result = match command {
        "health" | "agents" | "profiles" => {
            let path = match command {
                "health" => "/api/health",
                "agents" => "/api/agents",
                _ => "/api/profiles",
            };
            request(&host, "GET", path, None).map(|response| {
                if command == "profiles" && response.status == 200 {
                    print_profiles(&response.body);
                } else {
                    println!("{}", response.body);
                }
                response.status
            })
        }
        "ask" => {
            let text = args.get(1).cloned().unwrap_or_default();
            if text.is_empty() {
                eprintln!("Falta el texto: ely-rs ask \"tu pregunta\" [agente] [perfil]");
                return ExitCode::FAILURE;
            }
            let agent = args.get(2).cloned().unwrap_or_else(|| "photon".to_string());
            let profile = args.get(3).cloned();
            let mut payload = format!(
                "{{\"prompt\":\"{}\",\"agent\":\"{}\"",
                json_escape(&text),
                json_escape(&agent)
            );
            if let Some(profile) = profile {
                payload.push_str(&format!(",\"profile\":\"{}\"", json_escape(&profile)));
            }
            payload.push('}');
            request(&host, "POST", "/api/chat", Some(&payload)).map(|response| {
                if response.status != 200 {
                    eprintln!("HTTP {}: {}", response.status, response.body);
                } else {
                    match extract_field(&response.body, "text") {
                        Some(text) => println!("{text}"),
                        None => println!("{}", response.body),
                    }
                    if let Some(model) = extract_field(&response.body, "model") {
                        eprintln!("— {model} · {} · perfil {}", agent, profile_name(&response.body));
                    }
                }
                response.status
            })
        }
        "get" => {
            let path = args.get(1).cloned().unwrap_or_else(|| "/api/health".to_string());
            request(&host, "GET", &path, None).map(|r| {
                println!("{}", r.body);
                r.status
            })
        }
        "post" => {
            let path = args.get(1).cloned().unwrap_or_else(|| "/api/health".to_string());
            let body = args.get(2).cloned().unwrap_or_else(|| "{}".to_string());
            request(&host, "POST", &path, Some(&body)).map(|r| {
                println!("{}", r.body);
                r.status
            })
        }
        other => {
            eprintln!("Comando desconocido: {other}");
            usage();
            return ExitCode::FAILURE;
        }
    };

    match result {
        Ok(status) if status < 400 => ExitCode::SUCCESS,
        Ok(status) => {
            eprintln!("El servidor respondió {status}");
            ExitCode::FAILURE
        }
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn profile_name(body: &str) -> String {
    extract_field(body, "profile").unwrap_or_else(|| "?".to_string())
}
