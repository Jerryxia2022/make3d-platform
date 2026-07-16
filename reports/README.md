# Make3D Reports

This directory stores project phase reports for Make3D.

Rules:

- Before each phase, create a design report in `reports/`.
- Wait for confirmation before implementation.
- After implementation, create `reports/phaseXX-final.md`.
- Do not overwrite historical reports.
- Do not store passwords, tokens, private keys, payment certificates, or full customer private data in reports.

Recommended files:

- `phaseXX-design.md`
- `phaseXX-final.md`

Generate a new report from templates:

```bash
npm run report:phase -- --phase 04 --type design
npm run report:phase -- --phase 04 --type final
```

The generator refuses to overwrite an existing report.
