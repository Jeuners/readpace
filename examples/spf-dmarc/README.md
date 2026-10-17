# Example: spf-dmarc

Five slides about protecting a domain with SPF and DMARC, timed **by hand**
(4.2 / 5 / 6.3 / 5.3 / 4.2 s). Written in the [scene convention](../../docs/scene-convention.md),
so `fit` can re-time it.

```bash
npx readpace check examples/spf-dmarc   # 5 errors
npx readpace fit examples/spf-dmarc     # proposes 25.0 s → 50.2 s
```

Render it with HyperFrames as usual (`npx hyperframes render examples/spf-dmarc`).
