// Mapa chico del detalle: un solo cuadrado de OpenStreetMap con el punto marcado, sin librerías ni claves.
const ZOOM = 16;
const TILE = 256;

// Qué cuadrado mostrar y en qué lugar de ese cuadrado (de 0 a 1) cae el punto.
export function mapTile(lat: number, lng: number) {
  const scale = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * scale;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
  return { url: "https://tile.openstreetmap.org/" + ZOOM + "/" + Math.floor(x) + "/" + Math.floor(y) + ".png", size: TILE, left: x - Math.floor(x), top: y - Math.floor(y) };
}

export const mapLink = (lat: number, lng: number) => "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lng + "#map=" + ZOOM + "/" + lat + "/" + lng;
export const MAP_CREDIT = "© OpenStreetMap";

export type NearbyPlace = { nombre: string; direccion: string };
export type PlacesResult = { direccion: string; lugares: NearbyPlace[] };
