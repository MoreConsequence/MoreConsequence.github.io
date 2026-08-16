wrk.method = "POST"
function request()
  local body
  if math.random() < 0.1 then
    local big = string.rep("k", 1000000)
    body = '{"sku":"s-1","customerId":7,"qty":2,"idempotencyKey":"' .. big .. '"}'
  else
    body = '{"sku":"s-1","customerId":7,"qty":2,"idempotencyKey":"req-ok-1"}'
  end
  return wrk.format("POST", "/orders", {["Content-Type"]="application/json"}, body)
end
