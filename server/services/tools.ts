import { logger } from "../utils/logger";
import { ToolResult } from "../types";

/**
 * cancel_order(order_id: string) → mock success/failure
 * Simulates order cancellation with a 20% random failure rate.
 */
export async function cancelOrder(orderId: string): Promise<ToolResult> {
  logger.info(`[cancel_order] Processing cancellation for order: ${orderId}`);

  // Simulate processing delay (300-700ms)
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));

  if (!orderId || orderId.trim().length === 0) {
    return { success: false, error: "order_id is required and cannot be empty" };
  }

  // 20% failure rate as specified in the assignment
  if (Math.random() < 0.2) {
    logger.warn(`[cancel_order] Simulated failure for order ${orderId}`);
    return {
      success: false,
      error: `Order ${orderId} could not be cancelled. The order may already be shipped or processed.`,
    };
  }

  logger.info(`[cancel_order] Order ${orderId} cancelled successfully`);
  return {
    success: true,
    data: {
      orderId,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      refundInitiated: true,
      estimatedRefundAmount: parseFloat((Math.random() * 200 + 10).toFixed(2)),
    },
  };
}

/**
 * send_email(email: string, message: string) → simulates sending an email
 * Async sleep for 1 second as specified in the assignment.
 */
export async function sendEmail(
  email: string,
  message: string
): Promise<ToolResult> {
  logger.info(`[send_email] Sending email to: ${email}`);

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: `Invalid email address: ${email}` };
  }

  // Simulate 1-second email sending delay (as specified)
  await new Promise((r) => setTimeout(r, 1000));

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  logger.info(`[send_email] Email delivered: ${messageId}`);
  return {
    success: true,
    data: {
      messageId,
      to: email,
      messageLength: message.length,
      sentAt: new Date().toISOString(),
    },
  };
}

// Tool dispatcher with timeout protection
const TOOL_TIMEOUT_MS = 10_000;

export async function executeTool(
  toolName: string,
  args: Record<string, string | number | boolean>
): Promise<ToolResult> {
  logger.debug(`[executeTool] Dispatching: ${toolName}`, args);

  const toolPromise = (() => {
    switch (toolName.toLowerCase()) {
      case "cancel_order":
        return cancelOrder(String(args.order_id));

      case "send_email":
        return sendEmail(String(args.email), String(args.message || ""));

      default:
        return Promise.resolve<ToolResult>({
          success: false,
          error: `Unknown tool: "${toolName}". Available tools: cancel_order, send_email`,
        });
    }
  })();

  const timeoutPromise = new Promise<ToolResult>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Tool "${toolName}" timed out after ${TOOL_TIMEOUT_MS}ms`)),
      TOOL_TIMEOUT_MS
    )
  );

  return Promise.race([toolPromise, timeoutPromise]);
}
