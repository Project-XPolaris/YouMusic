import globby from 'globby';

describe('scan', async () => {
  const paths = await globby('C:\\Users\\Takay\\Desktop\\music_library', {
    expandDirectories: {
      extensions: ['mp3'],
    },
  });
  console.log(paths);
});
