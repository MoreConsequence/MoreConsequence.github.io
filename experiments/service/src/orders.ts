import { z } from "zod";

// 02 API 形状：先定错误的形状（契约），再定成功的形状
// 错误契约：所有 4xx 都返回 { error: { code, message, details? } }
const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),              // 机器可读: ORDER_NOT_FOUND / INVALID_QTY ...
    message: z.string(),           // 给人看
    details: z.array(z.object({
      path: z.array(z.string()),
      code: z.string(),
      message: z.string(),
    })).optional(),                // 给模型看(喂回修正)
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// 业务契约
export const OrderSchema = z.object({
  orderId: z.string(),
  sku: z.string(),
  customerId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
  status: z.enum(["CREATED", "PAID", "SHIPPED", "CANCELLED"]),
  createdAt: z.string().datetime(),
});
export type Order = z.infer<typeof OrderSchema>;

// 200 条第 1 条：错误码枚举是全局的，不是每个路由自造
export const ERROR_CODES = {
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  INVALID_QTY: "INVALID_QTY",
  DUPLICATE_ORDER: "DUPLICATE_ORDER",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
} as const;

export const toApiError = (code: string, message: string, details?: ApiError["error"]["details"]): ApiError => ({
  error: { code, message, details },
});
