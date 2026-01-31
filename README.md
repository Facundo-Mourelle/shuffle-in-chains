# Shuffle In Chains

This extension allows to "chain" together songs in a playlist that should reproduce one after the other in shuffle mode.

> [!CAUTION]
> The reordering of the playlist occurs when changing songs.

## Features
- Chain 2 or more songs together
- Songs are chained per playlist individually
- Clear all the current chains

## Deployment and Release
- [ ] Visualize list of chains
- [ ] Delete individual chains from the list
- [ ] Add symbols to recognize chained songs directly on the playlist

---
# Installation
## Spicetify Marketplace
Follow [Spicetify Marketplace](https://github.com/spicetify/spicetify-marketplace) readme for installation. Then simply search for `Shuffle in Chains` and install!


## Manual Installation
1. Copy `shuffle-in-chains.js` into your [Spicetify](https://github.com/spicetify/spicetify-cli) extensions directory:

| **Platform** | **Path** |
|------------|-----------------------------------------------------------------------------------|
| **Linux** | `~/.config/spicetify/Extensions` or `$XDG_CONFIG_HOME/.config/spicetify/Extensions/` |
| **MacOS** | `~/spicetify_data/Extensions` or `$SPICETIFY_CONFIG/Extensions` |
| **Windows** | `%appdata%\spicetify\Extensions` |

2. Run the following command to install the extension:
```
spicetify config extensions shuffle-in-chains.js
spicetify apply
```



---
## Made with Spicetify Creator
- https://github.com/spicetify/spicetify-creator
