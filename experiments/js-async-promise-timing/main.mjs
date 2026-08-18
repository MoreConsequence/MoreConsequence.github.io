const order = [];

console.log("node=" + process.version);

console.log("case=promise-order");
order.push("A");
setTimeout(() => order.push("B"), 0);
queueMicrotask(() => order.push("C"));
Promise.resolve().then(() => order.push("D"));
order.push("E");
await new Promise((resolve) => setTimeout(resolve, 0));
console.log("order=" + order.join(" "));

console.log("case=async-first-await");
const firstAwait = [];
async function firstAwaitDemo() {
  firstAwait.push("f:start");
  await Promise.resolve("p");
  firstAwait.push("f:after-await");
}
firstAwait.push("main:before-f");
const firstAwaitPromise = firstAwaitDemo();
firstAwait.push("main:after-f");
Promise.resolve().then(() => firstAwait.push("main-then:q"));
await firstAwaitPromise;
console.log("order=" + firstAwait.join(" -> "));

console.log("case=await-non-promise");
const nonPromise = [];
async function awaitValue() {
  nonPromise.push("before-await");
  await 42;
  nonPromise.push("after-await");
}
const valuePromise = awaitValue();
nonPromise.push("sync-end");
queueMicrotask(() => nonPromise.push("microtask"));
await valuePromise;
console.log("order=" + nonPromise.join(" -> "));

console.log("case=thenable");
let thenableN = 0;
const thenableEvents = [];
queueMicrotask(() => thenableN++);
async function awaitThenable() {
  await {
    then(resolve) {
      thenableEvents.push(`then@n=${thenableN}`);
      setTimeout(resolve, 30);
    },
  };
  thenableEvents.push(`resume@n=${thenableN}`);
}
const thenablePromise = awaitThenable();
queueMicrotask(() => thenableN++);
await thenablePromise;
console.log("events=" + thenableEvents.join(" -> "));

console.log("case=composition");
console.log("all=fail-fast-but-other-work-continues");
console.log("allSettled=waits-for-all");
console.log("any=first-fulfillment-or-all-rejected");
console.log("serial_critical_path_ms=240");
console.log("parallel_critical_path_ms=80");
