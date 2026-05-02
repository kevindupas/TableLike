use std::borrow::Cow;
use std::sync::Arc;
use tokio::io::copy_bidirectional;
use tokio::net::TcpListener;
use russh::client;
use russh::keys::key;
use russh::{kex, Preferred};
use crate::db::types::ConnectionConfig;

pub struct SshTunnel {
    pub local_port: u16,
    _abort_handle: tokio::task::JoinHandle<()>,
}

struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

impl SshTunnel {
    pub async fn connect(config: &ConnectionConfig) -> Result<Self, String> {
        let ssh_host = config.ssh_host.as_deref().ok_or("no ssh_host")?;
        let ssh_port = config.ssh_port.unwrap_or(22);
        let ssh_user = config
            .ssh_username
            .as_deref()
            .unwrap_or("root")
            .to_string();
        let db_host = config.host.clone();
        let db_port = config.port;

        // Build preferred algorithms list, extending with legacy ones if requested
        let kex_algos: Vec<kex::Name> = {
            let mut algos: Vec<kex::Name> = vec![
                kex::CURVE25519,
                kex::CURVE25519_PRE_RFC_8731,
                kex::DH_G16_SHA512,
                kex::DH_G14_SHA256,
                kex::EXTENSION_SUPPORT_AS_CLIENT,
                kex::EXTENSION_SUPPORT_AS_SERVER,
                kex::EXTENSION_OPENSSH_STRICT_KEX_AS_CLIENT,
                kex::EXTENSION_OPENSSH_STRICT_KEX_AS_SERVER,
            ];
            if config.ssh_add_legacy_kex.unwrap_or(false) {
                algos.push(kex::DH_G14_SHA1);
                algos.push(kex::DH_G1_SHA1);
            }
            algos
        };

        let key_algos: Vec<key::Name> = {
            let mut algos: Vec<key::Name> = vec![
                key::ED25519,
                key::ECDSA_SHA2_NISTP256,
                key::ECDSA_SHA2_NISTP521,
                key::RSA_SHA2_256,
                key::RSA_SHA2_512,
            ];
            if config.ssh_add_legacy_host_key.unwrap_or(false) {
                algos.push(key::SSH_RSA);
            }
            algos
        };

        let preferred = Preferred {
            kex: Cow::Owned(kex_algos),
            key: Cow::Owned(key_algos),
            ..Preferred::DEFAULT
        };

        let russh_config = Arc::new(client::Config {
            preferred,
            ..Default::default()
        });

        let mut session =
            client::connect(russh_config, (ssh_host, ssh_port), SshHandler)
                .await
                .map_err(|e| format!("SSH connect: {e}"))?;

        let use_password = config.ssh_use_password_auth.unwrap_or(false)
            || config.ssh_auth_method.as_deref() == Some("password");

        if use_password {
            let pwd = config.ssh_password.as_deref().unwrap_or("");
            let ok = session
                .authenticate_password(&ssh_user, pwd)
                .await
                .map_err(|e| format!("SSH auth: {e}"))?;
            if !ok {
                return Err("SSH password auth failed".into());
            }
        } else {
            let key_path = config
                .ssh_private_key_path
                .as_deref()
                .unwrap_or("~/.ssh/id_rsa");
            let expanded = shellexpand::tilde(key_path).to_string();
            let key_pair = russh::keys::load_secret_key(&expanded, None)
                .map_err(|e| format!("SSH key load: {e}"))?;
            let ok = session
                .authenticate_publickey(&ssh_user, Arc::new(key_pair))
                .await
                .map_err(|e| format!("SSH key auth: {e}"))?;
            if !ok {
                return Err("SSH key auth failed".into());
            }
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

        let handle = tokio::spawn(async move {
            loop {
                let Ok((mut local_stream, _)) = listener.accept().await else {
                    break;
                };
                let channel = match session
                    .channel_open_direct_tcpip(&db_host, db_port as u32, "127.0.0.1", 0)
                    .await
                {
                    Ok(c) => c,
                    Err(_) => break,
                };
                tokio::spawn(async move {
                    let mut remote = channel.into_stream();
                    let _ = copy_bidirectional(&mut local_stream, &mut remote).await;
                });
            }
        });

        Ok(SshTunnel {
            local_port,
            _abort_handle: handle,
        })
    }

    /// Connects and authenticates only — no tunnel. Returns Ok(()) on success.
    pub async fn test_auth(config: &ConnectionConfig) -> Result<(), String> {
        let ssh_host = config.ssh_host.as_deref().ok_or("no ssh_host")?;
        let ssh_port = config.ssh_port.unwrap_or(22);
        let ssh_user = config.ssh_username.as_deref().unwrap_or("root").to_string();

        let kex_algos: Vec<kex::Name> = {
            let mut algos: Vec<kex::Name> = vec![
                kex::CURVE25519,
                kex::CURVE25519_PRE_RFC_8731,
                kex::DH_G16_SHA512,
                kex::DH_G14_SHA256,
                kex::EXTENSION_SUPPORT_AS_CLIENT,
                kex::EXTENSION_SUPPORT_AS_SERVER,
                kex::EXTENSION_OPENSSH_STRICT_KEX_AS_CLIENT,
                kex::EXTENSION_OPENSSH_STRICT_KEX_AS_SERVER,
            ];
            if config.ssh_add_legacy_kex.unwrap_or(false) {
                algos.push(kex::DH_G14_SHA1);
                algos.push(kex::DH_G1_SHA1);
            }
            algos
        };

        let key_algos: Vec<key::Name> = {
            let mut algos: Vec<key::Name> = vec![
                key::ED25519,
                key::ECDSA_SHA2_NISTP256,
                key::ECDSA_SHA2_NISTP521,
                key::RSA_SHA2_256,
                key::RSA_SHA2_512,
            ];
            if config.ssh_add_legacy_host_key.unwrap_or(false) {
                algos.push(key::SSH_RSA);
            }
            algos
        };

        let preferred = Preferred {
            kex: Cow::Owned(kex_algos),
            key: Cow::Owned(key_algos),
            ..Preferred::DEFAULT
        };

        let russh_config = Arc::new(client::Config {
            preferred,
            ..Default::default()
        });

        let mut session = client::connect(russh_config, (ssh_host, ssh_port), SshHandler)
            .await
            .map_err(|e| format!("SSH connect: {e}"))?;

        let use_password = config.ssh_use_password_auth.unwrap_or(false)
            || config.ssh_auth_method.as_deref() == Some("password");

        if use_password {
            let pwd = config.ssh_password.as_deref().unwrap_or("");
            let ok = session
                .authenticate_password(&ssh_user, pwd)
                .await
                .map_err(|e| format!("SSH auth: {e}"))?;
            if !ok {
                return Err("SSH password auth failed".into());
            }
        } else {
            let key_path = config.ssh_private_key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = shellexpand::tilde(key_path).to_string();
            let key_pair = russh::keys::load_secret_key(&expanded, None)
                .map_err(|e| format!("SSH key load: {e}"))?;
            let ok = session
                .authenticate_publickey(&ssh_user, Arc::new(key_pair))
                .await
                .map_err(|e| format!("SSH key auth: {e}"))?;
            if !ok {
                return Err("SSH key auth failed".into());
            }
        }

        let _ = session.disconnect(russh::Disconnect::ByApplication, "", "en").await;
        Ok(())
    }
}

pub struct OpenSshTunnel {
    pub local_port: u16,
    child: tokio::process::Child,
}

impl OpenSshTunnel {
    pub async fn connect(config: &ConnectionConfig) -> Result<Self, String> {
        let ssh_host = config.ssh_host.as_deref().ok_or("no ssh_host")?;
        let ssh_port = config.ssh_port.unwrap_or(22);
        let ssh_user = config.ssh_username.as_deref().unwrap_or("root");
        let db_host = &config.host;
        let db_port = config.port;

        // Find a free local port
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("port bind: {e}"))?;
        let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
        drop(listener); // free the port before ssh takes it

        let forward_arg = format!("{local_port}:{db_host}:{db_port}");

        let use_password = config.ssh_use_password_auth.unwrap_or(false)
            || config.ssh_auth_method.as_deref() == Some("password");

        if use_password {
            let password = config.ssh_password.as_deref().unwrap_or("");
            let mut sshpass_cmd = tokio::process::Command::new("sshpass");
            sshpass_cmd.args(["-p", password]);
            sshpass_cmd.arg("ssh");
            sshpass_cmd.args([
                "-N",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ExitOnForwardFailure=yes",
                "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=3",
                "-p", &ssh_port.to_string(),
                "-L", &forward_arg,
                &format!("{ssh_user}@{ssh_host}"),
            ]);
            sshpass_cmd.stdout(std::process::Stdio::null());
            sshpass_cmd.stderr(std::process::Stdio::null());
            let child = sshpass_cmd
                .spawn()
                .map_err(|e| format!("sshpass spawn failed (is sshpass installed?): {e}"))?;
            Self::wait_for_tunnel(local_port, child).await
        } else {
            let mut cmd = tokio::process::Command::new("ssh");
            cmd.args([
                "-N",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ExitOnForwardFailure=yes",
                "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=3",
                "-p", &ssh_port.to_string(),
                "-L", &forward_arg,
            ]);
            if let Some(key_path) = &config.ssh_private_key_path {
                let expanded = shellexpand::tilde(key_path).to_string();
                cmd.args(["-i", &expanded]);
            }
            cmd.arg(&format!("{ssh_user}@{ssh_host}"));
            cmd.stdout(std::process::Stdio::null());
            cmd.stderr(std::process::Stdio::null());
            let child = cmd
                .spawn()
                .map_err(|e| format!("ssh spawn: {e}"))?;
            Self::wait_for_tunnel(local_port, child).await
        }
    }

    async fn wait_for_tunnel(
        local_port: u16,
        child: tokio::process::Child,
    ) -> Result<Self, String> {
        // Poll until local port is accepting connections (max 8s)
        for _ in 0..40 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{local_port}"))
                .await
                .is_ok()
            {
                return Ok(Self { local_port, child });
            }
        }
        Err(format!(
            "OpenSSH tunnel did not come up on port {local_port} within 8s"
        ))
    }

    pub async fn test_auth(config: &ConnectionConfig) -> Result<(), String> {
        let mut tunnel = Self::connect(config).await?;
        let _ = tunnel.child.kill().await;
        Ok(())
    }
}

impl Drop for OpenSshTunnel {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}
