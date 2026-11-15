#!/bin/sh
# Copies the publishable files into _site. No templating, no framework.
set -eu
rm -rf _site
mkdir -p _site
cp -R index.html 404.html robots.txt sitemap.xml assets data work status _site/
# Files that already live in the repo from earlier versions of the site
for f in CVA.pdf liveability_map.html House-Price-Prediction-NYC-; do
  [ -e "$f" ] && cp -R "$f" _site/ || echo "note: $f not found, skipping"
done
# Stamp the build date into the footer
DATE_ISO=$(date -u +%Y-%m-%d)
DATE_HUMAN=$(date -u +"%-d %b %Y")
sed -i.bak "s|<time id=\"build-date\" datetime=\"[^\"]*\">[^<]*</time>|<time id=\"build-date\" datetime=\"$DATE_ISO\">$DATE_HUMAN</time>|" _site/index.html
rm -f _site/index.html.bak
# Cache-bust CSS and JS: every deploy gets new URLs, so browsers never mix an old stylesheet with new HTML
VER=$(printf '%s' "${VERCEL_GIT_COMMIT_SHA:-${GITHUB_SHA:-$(date -u +%s)}}" | cut -c1-8)
find _site -name '*.html' ! -name 'liveability_map.html' -exec sed -i.bak -E "s#(assets/[A-Za-z0-9_./-]+\.(css|js))\"#\1?v=$VER\"#g" {} +
find _site -name '*.bak' -delete
echo "built _site ($(du -sh _site | cut -f1))"
