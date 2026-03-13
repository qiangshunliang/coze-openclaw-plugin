# coze-openclaw-plugin

OpenClaw plugin that adds Coze-powered web tools and bundled media skills.

- Tools: `coze_web_search`, `coze_web_fetch`
- Skills: `coze-tts`, `coze-asr`, `coze-image-gen`

## Install

```bash
openclaw plugins install coze-openclaw-plugin
```

## Configure

This plugin requires:

- `plugins.entries.coze-openclaw-plugin.config.apiKey`

Minimal configuration:

```json5
{
  plugins: {
    entries: {
      "coze-openclaw-plugin": {
        enabled: true,
        config: {
          apiKey: "YOUR_COZE_API_KEY"
        }
      }
    }
  }
}
```

Optional config fields:

- `baseUrl`
- `modelBaseUrl`
- `retryTimes`
- `retryDelay`
- `timeout`

## Replace Built-in Web Tools

If you want to use this plugin instead of OpenClaw built-in web search and fetch:

```json5
{
  plugins: {
    entries: {
      "coze-openclaw-plugin": {
        enabled: true,
        config: {
          apiKey: "YOUR_COZE_API_KEY"
        }
      }
    }
  },
  tools: {
    web: {
      search: {
        enabled: false
      },
      fetch: {
        enabled: false
      }
    }
  }
}
```

## Tools

### `coze_web_search`

Search the web or images through Coze.

Parameters:

- `query`
- `type`: `web` or `image`
- `count`
- `timeRange`
- `sites`
- `blockHosts`
- `needSummary`
- `needContent`

### `coze_web_fetch`

Fetch and normalize page or document content through Coze.

Parameters:

- `urls`
- `format`: `text`, `markdown`, or `json`
- `textOnly`

## Skills

Bundled skills:

- `coze-tts`: text to speech
- `coze-asr`: speech to text
- `coze-image-gen`: image generation

## Notes

- The plugin requires `apiKey` in plugin config
- Skill visibility depends on `plugins.entries.coze-openclaw-plugin.config.apiKey`
- The published npm package only includes runtime files, bundled skills, `README.md`, and `LICENSE`

## Contributing

See `./CONTRIBUTING.md` for the supported contribution flow.

## Security

See `./SECURITY.md` for how to report security issues.

## License

MIT
