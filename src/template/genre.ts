import { Genre } from '../database/entites/genre';

export class GenreTemplate {
  id: number;
  name: string;
  constructor(genre: Genre) {
    this.id = genre.id;
    this.name = genre.name;
  }
}
