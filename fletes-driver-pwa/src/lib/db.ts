import Dexie, { Table } from 'dexie';
import { Job } from './types';
class FletesDB extends Dexie {
  jobs!: Table<Job>;
  constructor() {
    super('FletesDriverDB');
    this.version(1).stores({ jobs: 'id, status, createdAt' });
  }
}
export const db = new FletesDB();