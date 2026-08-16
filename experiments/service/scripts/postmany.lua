wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
local i = 0
function request()
  i = i + 1
  local body = '{"sku":"s-' .. i .. '","customerId":7,"qty":2,"idempotencyKey":"req-' .. i .. '-' .. math.random(100000) .. '"}'
  return wrk.format("POST", "/orders", {["Content-Type"]="application/json"}, body)
end
