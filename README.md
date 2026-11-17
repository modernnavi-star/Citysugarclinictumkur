# City Sugar Clinic — Tumkur

A responsive, single-page website for City Sugar Clinic in Tumkur. The site is plain HTML, CSS, and JavaScript; it does not require a build step.

## Publish with GitHub Pages

The GitHub Actions workflow at `.github/workflows/deploy-pages.yml` configures Pages for GitHub Actions, uploads the repository's root files, and deploys whenever `main` is updated. It can also be started manually from the **Actions** tab.

If repository settings prevent the workflow from enabling Pages automatically, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then rerun the workflow. Once deployment completes, the site will be available at:

<https://modernnavi-star.github.io/Citysugarclinictumkur/>

## Preview locally

From the repository root, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
