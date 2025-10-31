import { DatabaseStorage } from "./storage";
import { VtigerStorage } from "./storage-vtiger";

export async function initializeDatabaseWithVtigerData() {
  try {
    const dbStorage = new DatabaseStorage();
    const vtigerStorage = new VtigerStorage();
    
    // Check if candidates already exist in database
    const existingCandidates = await dbStorage.getCandidates();
    console.log(`Database has ${existingCandidates.length} existing candidates`);
    
    // Daily sync now runs automatically on first server startup
    console.log("Daily VTiger sync configured to run on first server startup each day.");
    
    return true;
  } catch (error) {
    console.error("Failed to initialize database with Vtiger data:", error);
    return false;
  }
}