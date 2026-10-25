<div align="center">

# Tech Dictionary

**An open-source dictionary that simplifies tech jargon, from programming concepts to AI and DevOps.**

[![Live demo](https://img.shields.io/badge/Live_demo-096450?style=flat&logo=githubpages&logoColor=white)](https://fonij2002.github.io/tech-dictionary/)
[![CI/CD: GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/fonij2002/tech-dictionary/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[![Astro](https://img.shields.io/badge/Astro-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-7952B3?logo=bootstrap&logoColor=white)](https://getbootstrap.com/)
![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)
[![YAML](https://img.shields.io/badge/Data-YAML-CB171E?logo=yaml&logoColor=white)](./data/terms/)

</div>

## Features

- Search terms and filter by topic, difficulty, or first letter.
- Discover related terms and a daily featured word.
- Read definitions in desktop modals or dedicated mobile pages.
- Contribute through readable YAML files; reuse the generated JSON datasets.

## Run locally

```bash
git clone https://github.com/fonij2002/tech-dictionary.git
cd tech-dictionary
pnpm install
pnpm dev
```

Built with **Astro, TypeScript, and Bootstrap**, deployed to **GitHub Pages**.

## Contribute

Add or improve entries in `data/terms/*.yaml`, include reliable sources, and open a pull request. Before submitting:

```bash
pnpm check
```
