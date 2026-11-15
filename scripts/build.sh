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
echo "built _site ($(du -sh _site | cut -f1))"
