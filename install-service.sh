echo install youmusic service
workdir=`pwd`
sed "s|YMWorkDir|$workdir|g" service_template > YouMusicCoreService.service
mv "$workdir/YouMusicCoreService.service" "/etc/systemd/system/YouMusicCoreService.service"