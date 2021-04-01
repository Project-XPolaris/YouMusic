export interface MusicBrainAlbum {
  id: string;
  title: string;
  date: string;
  country: string;
  media: {
    position: number;
    track: {
      title: string;
      position: string;
      id: string;
    };
  }[];
}
