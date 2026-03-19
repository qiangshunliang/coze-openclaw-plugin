# coze-openclaw-plugin

OpenClaw plugin that adds Coze-powered web tools, bundled media skills, session recovery, and upgrade management.

- Tools: `coze_web_search`, `coze_web_fetch`
- Skills: `coze-tts`, `coze-asr`, `coze-image-gen`, `openclaw-faq`
- Session Recovery: auto-detect and resume interrupted agent sessions on gateway restart
- Upgrade Management: manifest-based upgrade with conflict detection and progressive apply

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

- `urls`: a single URL string or an array of URL strings
- `format`: `text`, `markdown`, or `json`
- `textOnly`

Examples:

```json
{
  "urls": "https://example.com/article"
}
```

```json
{
  "urls": ["https://example.com/a", "https://example.com/b"],
  "format": "markdown"
}
```

## Skills

Bundled skills:

- `coze-tts`: text to speech
- `coze-asr`: speech to text
- `coze-image-gen`: image generation
- `openclaw-faq`: OpenClaw/龙虾/扣子常见问题解答助手，自动从官方 FAQ 文档获取解决方案

## Session Recovery

Automatically detects and recovers interrupted agent sessions when the gateway restarts.

- Scans active sessions for interruption (unanswered user message or incomplete tool execution)
- Notifies the user and resumes the task in the background
- No configuration needed — enabled by default

## Upgrade Management

Manifest-based upgrade system with conflict detection and progressive application.

### CLI

```bash
openclaw coze upgrade status           # View current upgrade state
openclaw coze upgrade apply            # Execute pending upgrade plan
openclaw coze upgrade push-manifest '<json>'  # Push upgrade manifest
```

### Chat Command

- `/coze_update` — Display upgrade plan summary
- `/coze_update apply` — Execute pending upgrades

### HTTP API

- `GET /api/coze/upgrade/status` — Get current upgrade state and history
- `POST /api/coze/upgrade/apply` — Execute pending upgrade plan

## Notes

- The plugin requires `apiKey` in plugin config for Coze tools and skills
- Session recovery and upgrade modules work without `apiKey`
- The published npm package only includes runtime files, bundled skills, `README.md`, and `LICENSE`

## Contributing

See `./CONTRIBUTING.md` for the supported contribution flow.

## Security

See `./SECURITY.md` for how to report security issues.

## License

MIT
