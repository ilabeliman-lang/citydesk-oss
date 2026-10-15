import assert from "node:assert/strict";
import { addMember, createGroup } from "./sheet.ts";

const group = createGroup("  Lanai block  ", "ada");
assert.equal(group.name, "Lanai block");
assert.equal(group.ownerId, "ada");
assert.equal(group.members.length, 1);
assert.equal(group.members[0]?.userId, "ada");
assert.equal(group.members[0]?.role, "owner");

addMember(group, "ada");
addMember(group, "  ada  ");
const memberCount = addMember(group, "ada").members.length;
assert.equal(memberCount, 1, "adding the owner twice does not duplicate them");

addMember(group, "bea");
addMember(group, "bea");
assert.equal(group.members.length, 2);
assert.equal(group.members[1]?.role, "member");

assert.throws(() => createGroup("", "ada"), /name/);
assert.throws(() => createGroup("   ", "ada"), /name/);

console.log(memberCount);
