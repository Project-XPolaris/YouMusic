export class CreateLibraryDto {
  libraryPath: string;

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath;
  }
}
