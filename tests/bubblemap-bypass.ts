import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BubblemapBypass } from "../target/types/bubblemap_bypass";
import { expect } from "chai";

describe("bubblemap-bypass", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.BubblemapBypass as Program<BubblemapBypass>;

  it("Initializes the program", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
    expect(tx).to.be.a("string");
  });

  it("Executes bypass", async () => {
    const tx = await program.methods.bypass().rpc();
    console.log("Bypass transaction signature", tx);
    expect(tx).to.be.a("string");
  });
});

