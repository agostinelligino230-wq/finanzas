// La app usa el código de ../shared (formato, categorías, movimientos), el mismo que la web.
// El node_modules de la web (en la carpeta de arriba) queda bloqueado: tiene otro React y no es de la app.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const webModules = path.resolve(__dirname, "../node_modules").replace(/[/\\]/g, "[/\\\\]");

config.watchFolders = [path.resolve(__dirname, "../shared")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), new RegExp("^" + webModules + "[/\\\\].*")];

module.exports = config;
