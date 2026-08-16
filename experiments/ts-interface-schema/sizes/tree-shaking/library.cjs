function used(value) {
  return `used:${value}`;
}

function unusedOne() { return "unused-one-" + "x".repeat(256); }
function unusedTwo() { return "unused-two-" + "x".repeat(256); }
function unusedThree() { return "unused-three-" + "x".repeat(256); }
function unusedFour() { return "unused-four-" + "x".repeat(256); }
function unusedFive() { return "unused-five-" + "x".repeat(256); }

module.exports = { used, unusedOne, unusedTwo, unusedThree, unusedFour, unusedFive };
