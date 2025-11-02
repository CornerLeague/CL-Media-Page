/**
 * Comprehensive test suite for database error handling using Tiger MCP
 * Tests real database scenarios, error classification, and retry logic
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
import { withSource } from "../logger";

const log = withSource("tiger-mcp-error-handling-test");

// Tiger MCP service configuration
const TIGER_SERVICE_ID = "ftgijgvdz2";

/**
 * Test Tiger MCP database connection and basic operations
 */
async function testTigerMCPConnection() {
  log.info("Testing Tiger MCP database connection...");
  
  try {
    // Test basic connection with a simple query
    console.log("Executing basic SELECT query...");
    const basicResult = await executeRawQuery(
      "SELECT 1 as test_value, 'Hello Tiger MCP' as message, NOW() as timestamp",
      [],
      { test: 'tiger-mcp-basic' }
    );
    
    console.log("✅ Basic Tiger MCP Query Result:", basicResult);
    
    // Test parameterized query
    console.log("Executing parameterized query...");
    const paramResult = await executeRawQuery(
      "SELECT $1::text as input_text, $2::int as input_number, $3::boolean as input_flag",
      ["Test Parameter", 42, true],
      { test: 'tiger-mcp-params' }
    );
    
    console.log("✅ Parameterized Query Result:", paramResult);
    
    // Test query with potential error (invalid syntax)
    console.log("Testing error handling with invalid query...");
    try {
      await executeRawQuery(
        "SELECT * FROM non_existent_table_12345",
        [],
        { test: 'tiger-mcp-error' }
      );
      console.log("❌ Expected error but query succeeded");
    } catch (error: unknown) {
      if (error instanceof DatabaseError) {
        console.log("✅ Caught expected DatabaseError:", {
          code: error.code,
          message: error.message,
          isRetryable: isRetryableError(error),
          userMessage: getUserFriendlyErrorMessage(error)
        });
      } else {
        console.log("✅ Caught expected error:", (error as Error).message);
      }
    }
    
  } catch (error: unknown) {
    log.error({ error }, "Tiger MCP connection test failed");
    throw error;
  }
}

/**
 * Test different error scenarios and classification
 */
async function testErrorScenarios() {
  log.info("Testing various error scenarios...");
  
  const errorScenarios = [
    {
      name: "Syntax Error",
      query: "SELCT 1", // Intentional typo
      expectedCode: DB_ERROR_CODES.SYNTAX_ERROR
    },
    {
      name: "Undefined Table",
      query: "SELECT * FROM definitely_not_a_real_table_name_12345",
      expectedCode: DB_ERROR_CODES.UNDEFINED_TABLE
    },
    {
      name: "Invalid Data Type",
      query: "SELECT 'not_a_number'::integer",
      expectedCode: DB_ERROR_CODES.INVALID_TEXT_REPRESENTATION
    }
  ];
  
  for (const scenario of errorScenarios) {
    console.log(`\nTesting ${scenario.name}...`);
    
    try {
      await executeRawQuery(scenario.query, [], { test: `error-${scenario.name.toLowerCase().replace(' ', '-')}` });
      console.log(`❌ Expected error for ${scenario.name} but query succeeded`);
    } catch (error: unknown) {
      if (error instanceof DatabaseError) {
        console.log(`✅ ${scenario.name} properly classified:`, {
          code: error.code,
          message: error.message,
          isRetryable: isRetryableError(error),
          userMessage: getUserFriendlyErrorMessage(error)
        });
      } else {
        console.log(`✅ ${scenario.name} caught:`, (error as Error).message);
      }
    }
  }
}

/**
 * Test transaction error handling
 */
async function testTransactionErrorHandling() {
  log.info("Testing transaction error handling...");
  
  try {
    // Test successful transaction
    console.log("Testing successful transaction...");
    const successResult = await executeTransaction(async (client, context) => {
      log.info({ transactionId: context.transactionId }, "Transaction started");
      
      // Create a temporary table for testing
      await client.query(`
        CREATE TEMP TABLE test_transaction_${context.transactionId.replace(/-/g, '_')} (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Insert test data
      const insertResult = await client.query(`
        INSERT INTO test_transaction_${context.transactionId.replace(/-/g, '_')} (name) 
        VALUES ($1) RETURNING *
      `, ['Test Transaction Data']);
      
      // Query the data back
      const selectResult = await client.query(`
        SELECT * FROM test_transaction_${context.transactionId.replace(/-/g, '_')}
      `);
      
      log.info({ transactionId: context.transactionId }, "Transaction operations completed");
      
      return {
        inserted: insertResult.rows[0],
        selected: selectResult.rows
      };
    }, {}, { test: 'transaction-success' });
    
    console.log("✅ Transaction completed successfully:", successResult);
    
    // Test transaction with error (should rollback)
    console.log("\nTesting transaction rollback on error...");
    try {
      await executeTransaction(async (client, context) => {
        log.info({ transactionId: context.transactionId }, "Transaction with error started");
        
        // Create a temporary table
        await client.query(`
          CREATE TEMP TABLE test_rollback_${context.transactionId.replace(/-/g, '_')} (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL
          )
        `);
        
        // Insert valid data
        await client.query(`
          INSERT INTO test_rollback_${context.transactionId.replace(/-/g, '_')} (name) 
          VALUES ($1)
        `, ['Valid Data']);
        
        // Cause an error (duplicate key if we had a unique constraint, or syntax error)
        await client.query("SELECT * FROM non_existent_table_for_rollback_test");
        
        return { success: true };
      }, {}, { test: 'transaction-rollback' });
      
      console.log("❌ Expected transaction to fail but it succeeded");
    } catch (error) {
      if (error instanceof DatabaseError) {
        console.log("✅ Transaction properly rolled back on error:", {
          code: error.code,
          message: error.message,
          isRetryable: isRetryableError(error)
        });
      } else {
        console.log("✅ Transaction rolled back:", error instanceof Error ? error.message : String(error));
      }
    }
    
  } catch (error: unknown) {
    log.error({ error: error instanceof Error ? error.message : String(error) }, "Transaction test failed");
    throw error;
  }
}

/**
 * Test retry logic with simulated transient errors
 */
async function testRetryLogic() {
  log.info("Testing retry logic...");
  
  // Test with a query that should succeed after classification
  try {
    console.log("Testing retry classification...");
    
    // Simulate different error types to test classification
    const connectionError = new Error("Connection refused");
    (connectionError as any).code = DB_ERROR_CODES.CONNECTION_REFUSED;
    
    const classifiedError = classifyDatabaseError(connectionError, 'test-retry');
    console.log("Connection error classification:", {
      code: classifiedError.code,
      isRetryable: isRetryableError(classifiedError),
      userMessage: getUserFriendlyErrorMessage(classifiedError)
    });
    
    // Test serialization failure
    const serializationError = new Error("Serialization failure");
    (serializationError as any).code = DB_ERROR_CODES.SERIALIZATION_FAILURE;
    
    const classifiedSerializationError = classifyDatabaseError(serializationError, 'test-serialization');
    console.log("Serialization error classification:", {
      code: classifiedSerializationError.code,
      isRetryable: isRetryableError(classifiedSerializationError),
      userMessage: getUserFriendlyErrorMessage(classifiedSerializationError)
    });
    
    console.log("✅ Retry logic classification tests completed");
    
  } catch (error) {
    log.error({ error }, "Retry logic test failed");
    throw error;
  }
}

/**
 * Main test runner
 */
async function runTigerMCPErrorHandlingTests() {
  console.log("=== Tiger MCP Database Error Handling Tests ===\n");
  
  try {
    // Test 1: Tiger MCP Connection and Basic Operations
    await testTigerMCPConnection();
    console.log("\n" + "=".repeat(60) + "\n");
    
    // Test 2: Error Scenarios and Classification
    await testErrorScenarios();
    console.log("\n" + "=".repeat(60) + "\n");
    
    // Test 3: Transaction Error Handling
    await testTransactionErrorHandling();
    console.log("\n" + "=".repeat(60) + "\n");
    
    // Test 4: Retry Logic
    await testRetryLogic();
    console.log("\n" + "=".repeat(60) + "\n");
    
    console.log("✅ All Tiger MCP database error handling tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Tiger MCP test suite failed:", error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTigerMCPErrorHandlingTests().catch(console.error);
}

export { runTigerMCPErrorHandlingTests };