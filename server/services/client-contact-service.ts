import { IStorage } from '../storage';
import { InsertTodo, Client } from '../../shared/schema';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export class ClientContactService {
  constructor(private storage: IStorage) {}

  /**
   * Checks if a client is missing essential contact person information
   */
  private isContactPersonMissing(client: Client): boolean {
    return !client.contactName || !client.contactEmail || !client.contactPhone;
  }

  /**
   * Get all users with admin role
   */
  private async getAdminUsers() {
    try {
      const adminUsers = await db
        .select()
        .from(users)
        .where(eq(users.role, "admin"));
      
      return adminUsers;
    } catch (error) {
      console.error("Error fetching admin users:", error);
      return [];
    }
  }

  /**
   * Creates todos for admin users to add missing contact person information
   */
  async createContactPersonTodos(clientId: number): Promise<any[]> {
    try {
      // Get the client
      const client = await this.storage.getClient(clientId);
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }

      // Check if contact person information is missing
      if (!this.isContactPersonMissing(client)) {
        console.log(`Client ${client.name} already has complete contact person information`);
        return [];
      }

      // Get all admin users
      const adminUsers = await this.getAdminUsers();
      if (adminUsers.length === 0) {
        console.warn("No admin users found to assign contact person todos");
        return [];
      }

      const createdTodos = [];

      // Create a todo for each admin user
      for (const admin of adminUsers) {
        const missingFields = [];
        if (!client.contactName) missingFields.push('contact name');
        if (!client.contactEmail) missingFields.push('contact email');
        if (!client.contactPhone) missingFields.push('contact phone');

        const todoData: InsertTodo = {
          userId: admin.id,
          title: `Add contact person for ${client.name}`,
          description: `Client "${client.name}" is missing contact person information. Please add: ${missingFields.join(', ')}.`,
          priority: "high",
          status: "pending",
          relatedType: "client",
          relatedId: clientId,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
        };

        const createdTodo = await this.storage.createTodo(todoData);
        createdTodos.push(createdTodo);
        
        console.log(`Created contact person todo for admin ${admin.fullName || admin.email} for client ${client.name}`);
      }

      return createdTodos;
    } catch (error) {
      console.error("Error creating contact person todos:", error);
      throw error;
    }
  }

  /**
   * Checks all clients and creates todos for those missing contact person information
   */
  async checkAllClientsForMissingContactPersons(): Promise<{ 
    totalClients: number; 
    clientsWithMissingContact: number; 
    todosCreated: number; 
  }> {
    try {
      console.log("Checking all clients for missing contact person information...");
      
      // Get all clients
      const clients = await this.storage.getClients();
      const clientsWithMissingContact = clients.filter(client => this.isContactPersonMissing(client));
      
      let totalTodosCreated = 0;

      // Create todos for clients missing contact person information
      for (const client of clientsWithMissingContact) {
        // Check if there's already a pending todo for this client's contact person  
        // Note: We'll check for any admin user's todos to avoid duplicates
        const adminUsers = await this.getAdminUsers();
        let hasExistingTodo = false;
        
        for (const admin of adminUsers) {
          const adminTodos = await this.storage.getTodos(admin.id);
          hasExistingTodo = adminTodos.some(todo => 
            todo.relatedType === "client" && 
            todo.relatedId === client.id && 
            todo.status === "pending" &&
            todo.title.includes("Add contact person")
          );
          if (hasExistingTodo) break;
        }

        if (!hasExistingTodo) {
          const createdTodos = await this.createContactPersonTodos(client.id);
          totalTodosCreated += createdTodos.length;
        } else {
          console.log(`Todo already exists for client ${client.name}, skipping...`);
        }
      }

      const result = {
        totalClients: clients.length,
        clientsWithMissingContact: clientsWithMissingContact.length,
        todosCreated: totalTodosCreated
      };

      console.log(`Contact person check completed:`, result);
      return result;
    } catch (error) {
      console.error("Error checking clients for missing contact persons:", error);
      throw error;
    }
  }

  /**
   * Marks the contact person todo as completed when client contact information is updated
   */
  async completeContactPersonTodo(clientId: number): Promise<void> {
    try {
      // Get the client to verify contact person information is now complete
      const client = await this.storage.getClient(clientId);
      if (!client) {
        return;
      }

      // Only complete todos if contact person information is now complete
      if (!this.isContactPersonMissing(client)) {
        const adminUsers = await this.getAdminUsers();
        const clientContactTodos = [];
        
        // Check todos for all admin users
        for (const admin of adminUsers) {
          const adminTodos = await this.storage.getTodos(admin.id);
          const adminClientTodos = adminTodos.filter(todo => 
            todo.relatedType === "client" && 
            todo.relatedId === clientId && 
            todo.status === "pending" &&
            todo.title.includes("Add contact person")
          );
          clientContactTodos.push(...adminClientTodos);
        }

        for (const todo of clientContactTodos) {
          await this.storage.updateTodo(todo.id, { 
            status: "completed"
          });
          console.log(`Completed contact person todo for client ${client.name}`);
        }
      }
    } catch (error) {
      console.error("Error completing contact person todo:", error);
    }
  }
}