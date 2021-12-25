yarn build
rm -rf ./app-output
mkdir app-output
cp -r ./dist ./app-output/dist
cp ./package.json ./app-output
cp ./service_template ./app-output
cp ./install-service.sh ./app-output
cp ./uninstall-service.sh ./app-output
cp ./docker-compose.yml ./app-output
cp ./nest-cli.json ./app-output
cp ./tsconfig.build.json ./app-output
cp ./tsconfig.build.json ./app-output
cp ./ulist.json ./app-output
cp ./youplus.json ./app-output
cp ./icon.png ./app-output
cp ./install.sh ./app-output
cp ./uninstall.sh ./app-output
cp ./clean.sh ./app-output
cp -r ./src/rpc ./app-output/dist/rpc
cp -r ./src/conf ./app-output/dist/conf
