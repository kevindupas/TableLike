import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { DbType } from "../store/connections";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ParsedConnectionUrl {
  dbType: DbType | null;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

export function parseConnectionUrl(raw: string): ParsedConnectionUrl | null {
  try {
    const trimmed = raw.trim();
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):\/\/(.*)/s);
    if (!schemeMatch) return null;
    const scheme = schemeMatch[1].toLowerCase();
    const rest = schemeMatch[2];

    const dbType: DbType | null =
      scheme === "postgresql" || scheme === "postgres" ? "postgresql"
      : scheme === "mysql" ? "mysql"
      : scheme === "sqlite" || scheme === "sqlite3" ? "sqlite"
      : null;
    if (!dbType) return null;

    if (dbType === "sqlite") {
      const path = "/" + rest.replace(/^\/+/, "");
      return { dbType, host: "", port: "", database: path, username: "", password: "" };
    }

    const [authority, ...pathParts] = rest.split("/");
    const database = decodeURIComponent(pathParts.join("/").split("?")[0]);

    let userInfo = "";
    let hostPart = authority;
    const atIdx = authority.lastIndexOf("@");
    if (atIdx !== -1) {
      userInfo = authority.slice(0, atIdx);
      hostPart = authority.slice(atIdx + 1);
    }

    let username = "";
    let password = "";
    if (userInfo) {
      const colonIdx = userInfo.indexOf(":");
      if (colonIdx !== -1) {
        username = decodeURIComponent(userInfo.slice(0, colonIdx));
        password = decodeURIComponent(userInfo.slice(colonIdx + 1));
      } else {
        username = decodeURIComponent(userInfo);
      }
    }

    let host = hostPart;
    let port = "";
    if (hostPart.startsWith("[")) {
      const close = hostPart.indexOf("]");
      host = hostPart.slice(1, close);
      const afterBracket = hostPart.slice(close + 1);
      if (afterBracket.startsWith(":")) port = afterBracket.slice(1);
    } else {
      const lastColon = hostPart.lastIndexOf(":");
      if (lastColon !== -1) {
        host = hostPart.slice(0, lastColon);
        port = hostPart.slice(lastColon + 1);
      }
    }

    if (!port) port = dbType === "mysql" ? "3306" : "5432";

    return { dbType, host, port, database, username, password };
  } catch {
    return null;
  }
}

export function buildConnectionUrl(
  dbType: DbType,
  host: string,
  port: string,
  database: string,
  username: string,
): string {
  if (dbType === "sqlite") return `sqlite://${database}`;
  const scheme = dbType === "mysql" ? "mysql" : "postgresql";
  const userPart = username ? `${encodeURIComponent(username)}@` : "";
  const portPart = port ? `:${port}` : "";
  const dbPart = database ? `/${encodeURIComponent(database)}` : "";
  return `${scheme}://${userPart}${host}${portPart}${dbPart}`;
}
