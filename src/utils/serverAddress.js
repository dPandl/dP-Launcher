// Der aktive Server und seine Adresse. Fest im Code steht kein Server.

export function getServers(settings) {
  return Array.isArray(settings?.servers) ? settings.servers : [];
}

export function getActiveServer(settings) {
  return getServers(settings).find(server => server.id === settings?.activeServerId) || null;
}

// Server des Server-Admins: eigene Einstellungen, unabhängig von der Spielliste
export const ADMIN_SERVER_ID = '_admin';

export function getAdminServer(settings) {
  return {
    id: ADMIN_SERVER_ID, name: '', address: '', owner: '', repo: '', branch: 'main', description: '', banner: '',
    ...(settings?.adminServer || {})
  };
}

// Adresse des aktiven Servers. Älter angelegte Einstellungen und die Modliste dienen als Rückfall.
export function resolveServerAddress(settings, manifest) {
  const active = getActiveServer(settings)?.address;
  if (active) return active;
  const legacy = (settings?.serverIp || '').trim();
  if (legacy) return legacy;
  return (manifest?.serverAddress || '').trim();
}

// Zerlegt "host:port" in Host und Port (Standardport 25565)
export function splitServerAddress(address) {
  const clean = (address || '').trim();
  if (!clean) return { host: '', port: 25565 };
  const [host, port] = clean.split(':');
  return { host: host || '', port: parseInt(port, 10) || 25565 };
}
