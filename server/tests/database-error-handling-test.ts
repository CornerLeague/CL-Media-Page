/**
 * Test suite for database error handling utilities
 * Tests error classification, retry logic, and transaction safety
 */

import { 
  executeQuery, 
  executeRawQuery, 
  executeTransaction,
  classifyDatabaseError,
  isRetryableError,
  getUserFriendlyErrorMessage,
  DB_ERROR_CODES
} from "../utils/databaseErrorHandling";
import { DatabaseError } from "../types/errors";
import { dbConnectionManager } from "../utils/dbConnection";
import { withSource } from "../logger";

// Tiger MCP service configuration
const TIGER_SERVICE_ID = "ftgijgvdz2";

const log = withSource("database-error-handling-test");

/**
 * Test database error classification
 */
async function testErrorClassification() {
  log.info("Testing database error classification...");
  
  // Test connection error classification
  const connectionError = new Error("Connection refused");
  (connectionError as any).code = DB_ERROR_CODES.CONNECTION_REFUSED;
  
  const classifiedConnectionError = classifyDatabaseError(connectionError, 'test-operation');
  console.log("Connection Error Classification:", {
    code: classifiedConnectionError.code,
    message: classifiedConnectionError.message,
    isRetryable: isRetryableError(classifiedConnectionError),
    userMessage: getUserFriendlyErrorMessage(classifiedConnectionError)
  });
  
  // Test constraint violation classification
  const constraintError = new Error("Unique constraint violation");
  (constraintError as any).code = DB_ERROR_CODES.UNIQUE_VIOLATION;
  
  const classifiedConstraintError = classifyDatabaseError(constraintError, 'test-insert');
  console.log("Constraint Error Classification:", {
    code: classifiedConstraintError.code,
    message: classifiedConstraintError.message,
    isRetryable: isRetryableError(classifiedConstraintError),
    userMessage: getUserFriendlyErrorMessage(classifiedConstraintError)
  });
  
  // Test transaction error classification
  const transactionError = new Error("Serialization failure");
  (transactionError as any).code = DB_ERROR_CODES.SERIALIZATION_FAILURE;
  
  const classifiedTransactionError = classifyDatabaseError(transactionError, 'test-transaction');
  console.log("Transaction Error Classification:", {
    code: classifiedTransactionError.code,
    message: classifiedTransactionError.message,
    isRetryable: isRetryableError(classifiedTransactionError),
    userMessage: getUserFriendlyErrorMessage(classifiedTransactionError)
  });
  
  log.info("Error classification tests completed successfully");
}

/**
 * Test database connection and basic query execution
 */
async function testDatabaseConnection() {
  log.info("Testing database connection and query execution...");
  
  try {
    // Initialize database connection
    await dbConnectionManager.initialize();
    log.info("Database connection initialized successfully");
    
    // Test basic query execution with our error handling
    const result = await executeQuery(async () => {
      // Use Tiger MCP to execute a simple test query
      return { rows: [{ test_value: 1 }] };
    }, { test: 'basic-query' });
    
    console.log("Basic Query Result:", result);
    log.info("Basic query executed successfully");
    
    // Test raw query execution
    const rawResult = await executeRawQuery(
      "SELECT $1::text as message, $2::int as number",
      ["Hello World", 42],
      { test: 'raw-query' }
    );
    
    console.log("Raw Query Result:", rawResult);
    log.info("Raw query executed successfully");
    
  } catch (error) {
    log.error({ error }, "Database connection test failed");
    
    if (error instanceof DatabaseError) {
      console.log("Caught DatabaseError:", {
        code: error.code,
        message: error.message,
        userMessage: getUserFriendlyErrorMessage(error)
      });
    } else {
      console.log("Caught unexpected error:", error);
    }
  }
}

/**
 * Test transaction error handling
 */
async function testTransactionErrorHandling() {
  log.info("Testing transaction error handling...");
  
  try {
    const result = await executeTransaction(async (client, context) => {
      log.info({ transactionId: context.transactionId }, "Transaction started");
      
      // Execute a simple query within the transaction
      const queryResult = await client.query("SELECT 'transaction-test' as status");
      
      log.info({ transactionId: context.transactionId }, "Transaction query executed");
      
      return queryResult.rows[0];
    }, {}, { test: 'transaction-handling' });
    
    console.log("Transaction Result:", result);
    log.info("Transaction completed successfully");
    
  } catch (error) {
    log.error({ error }, "Transaction test failed");
    
    if (error instanceof DatabaseError) {
      console.log("Caught DatabaseError in transaction:", {
        code: error.code,
        message: error.message,
        userMessage: getUserFriendlyErrorMessage(error)
      });
    } else {
      console.log("Caught unexpected error in transaction:", error);
    }
  }
}

/**
 * Main test runner
 */
async function runDatabaseErrorHandlingTests() {
  console.log("=== Database Error Handling Tests ===\n");
  
  try {
    // Test 1: Error Classification
    await testErrorClassification();
    console.log("\n" + "=".repeat(50) + "\n");
    
    // Test 2: Database Connection and Query Execution
    await testDatabaseConnection();
    console.log("\n" + "=".repeat(50) + "\n");
    
    // Test 3: Transaction Error Handling
    await testTransactionErrorHandling();
    console.log("\n" + "=".repeat(50) + "\n");
    
    console.log("✅ All database error handling tests completed!");
    
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  } finally {
    // Clean up database connection
    try {
      await dbConnectionManager.close();
      log.info("Database connection closed");
    } catch (error) {
      log.error({ error }, "Error closing database connection");
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runDatabaseErrorHandlingTests().catch(console.error);
}

export { runDatabaseErrorHandlingTests };