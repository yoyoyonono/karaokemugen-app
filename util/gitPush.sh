#!/bin/bash
git config user.name "Release Bot"
git config user.email "server@karaokes.moe"
git checkout $CI_COMMIT_BRANCH
git pull
bash util/replaceVersion.sh
git add package.json
VERSION=$(grep version\": package.json | awk -F\" {'print $4'})
git commit -m "🚀 new release $VERSION"
git remote set-url origin "https://project_32123684_bot:$DEPLOY_TOKEN@gitlab.com/karaokemugen/code/karaokemugen-app.git"
git push