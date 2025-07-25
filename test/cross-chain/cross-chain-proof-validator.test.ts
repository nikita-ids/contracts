import {
  GlobalStateMessage,
  IdentityStateMessage,
  packGlobalStateUpdateWithSignature,
  packIdentityStateUpdateWithSignature,
} from "../utils/packData";
import { expect } from "chai";
import { DeployHelper } from "../../helpers/DeployHelper";
import { Contract, ZeroAddress } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Process cross-chain proof", function () {
  let crossChainProofValidator: Contract;
  let signer, signer2, signer3;

  async function deployContractsFixture() {
    [signer, signer2, signer3] = await ethers.getSigners();
    const deployHelper = await DeployHelper.initialize(null, true);
    crossChainProofValidator = await deployHelper.deployCrossChainProofValidator();
    await crossChainProofValidator.setLegacyOracleSigningAddress(signer2.address);
  }

  beforeEach(async function () {
    await loadFixture(deployContractsFixture);
  });

  it("Should process the messages without replacedAtTimestamp", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: 0n,
    };

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    const gsu = await packGlobalStateUpdateWithSignature(gsm, signer);
    const isu = await packIdentityStateUpdateWithSignature(ism, signer);

    const gspResult = await crossChainProofValidator.processGlobalStateProof(gsu);
    const ispResult = await crossChainProofValidator.processIdentityStateProof(isu);

    // result should be equal to timestamp from oracle as far as replacedAtTimestamp is zero in the messages
    expect(gspResult.replacedAtTimestamp).to.equal(gsm.timestamp);
    expect(ispResult.replacedAtTimestamp).to.equal(ism.timestamp);

    const gsu2 = await packGlobalStateUpdateWithSignature(gsm, signer2);
    const isu2 = await packIdentityStateUpdateWithSignature(ism, signer2);

    await expect(crossChainProofValidator.processGlobalStateProof(gsu2)).not.to.be.reverted;
    await expect(crossChainProofValidator.processIdentityStateProof(isu2)).not.to.be.reverted;
  });

  it("Should process the messages with replacedAtTimestamp", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: 100n,
    };

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 100n,
    };

    const gsu = await packGlobalStateUpdateWithSignature(gsm, signer);
    const isu = await packIdentityStateUpdateWithSignature(ism, signer);

    const gspResult = await crossChainProofValidator.processGlobalStateProof(gsu);
    const ispResult = await crossChainProofValidator.processIdentityStateProof(isu);

    // result should be equal replacedAtTimestamp in the messages
    expect(gspResult.replacedAtTimestamp).to.equal(gsm.replacedAtTimestamp);
    expect(ispResult.replacedAtTimestamp).to.equal(ism.replacedAtTimestamp);
  });

  it("Oracle timestamp should not be in the past", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp - 10n ** 6n,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    const proof = await packIdentityStateUpdateWithSignature(ism, signer);
    await expect(
      crossChainProofValidator.processIdentityStateProof(proof),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "OracleTimestampCannotBeInThePast");
  });

  it("Oracle replacedAtTimestamp or oracle timestamp cannot be in the future", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: currentTimestamp + 10n ** 6n,
    };

    let proof = await packGlobalStateUpdateWithSignature(gsm, signer);
    await expect(
      crossChainProofValidator.processGlobalStateProof(proof),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "OracleReplacedAtTimestampCannotBeInTheFuture",
    );

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp + 10n ** 6n,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    proof = await packIdentityStateUpdateWithSignature(ism, signer);
    await expect(
      crossChainProofValidator.processIdentityStateProof(proof),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "OracleReplacedAtTimestampCannotBeInTheFuture",
    );
  });

  it("Should fail to verify a message which was tampered with", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: currentTimestamp + 10n ** 6n,
    };

    let proof = await packGlobalStateUpdateWithSignature(gsm, signer, true);
    await expect(
      crossChainProofValidator.processGlobalStateProof(proof),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "GlobalStateProofSigningAddressInvalid",
    );

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    proof = await packIdentityStateUpdateWithSignature(ism, signer, true);
    await expect(
      crossChainProofValidator.processIdentityStateProof(proof),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "IdentityStateProofSigningAddressInvalid",
    );
  });

  it("Should fail to verify a message which signature is invalid", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: currentTimestamp + 10n ** 6n,
    };

    let proof = await packGlobalStateUpdateWithSignature(gsm, signer, false, true);
    await expect(
      crossChainProofValidator.processGlobalStateProof(proof),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "GlobalStateProofInvalid");

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    proof = await packIdentityStateUpdateWithSignature(ism, signer, false, true);
    await expect(
      crossChainProofValidator.processIdentityStateProof(proof),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "IdentityStateProofInvalid");
  });

  it("Should process the message signed by the legacy oracle signing address", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: 0n,
    };

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    const gsu = await packGlobalStateUpdateWithSignature(gsm, signer2);
    const isu = await packIdentityStateUpdateWithSignature(ism, signer2);

    const gspResult = await crossChainProofValidator.processGlobalStateProof(gsu);
    const ispResult = await crossChainProofValidator.processIdentityStateProof(isu);

    // result should be equal to timestamp from oracle as far as replacedAtTimestamp is zero in the messages
    expect(gspResult.replacedAtTimestamp).to.equal(gsm.timestamp);
    expect(ispResult.replacedAtTimestamp).to.equal(ism.timestamp);
  });

  it("Should fail if the message is signed by the legacy oracle signing address and legacy oracle signing address is disabled", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: 0n,
    };

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };
    const gsu = await packGlobalStateUpdateWithSignature(gsm, signer2);
    const isu = await packIdentityStateUpdateWithSignature(ism, signer2);
    await crossChainProofValidator.disableLegacyOracleSigningAddress();
    await expect(crossChainProofValidator.processGlobalStateProof(gsu))
      .to.be.revertedWithCustomError(
        crossChainProofValidator,
        "GlobalStateProofSigningAddressInvalid",
      )
      .withArgs(signer2.address);
    await expect(crossChainProofValidator.processIdentityStateProof(isu))
      .to.be.revertedWithCustomError(
        crossChainProofValidator,
        "IdentityStateProofSigningAddressInvalid",
      )
      .withArgs(signer2.address);
  });

  it("Should fail if signed by wrong oracle signing address", async function () {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const gsm: GlobalStateMessage = {
      timestamp: currentTimestamp,
      idType: "0x01A1",
      root: 0n,
      replacedAtTimestamp: 0n,
    };

    const ism: IdentityStateMessage = {
      timestamp: currentTimestamp,
      id: 25061242388220042378440625585145526395156084635704446088069097186261377537n,
      state: 289901420135126415231045754640573166676181332861318949204015443942679340619n,
      replacedAtTimestamp: 0n,
    };

    const gsu = await packGlobalStateUpdateWithSignature(gsm, signer3);
    const isu = await packIdentityStateUpdateWithSignature(ism, signer3);

    await expect(crossChainProofValidator.processGlobalStateProof(gsu))
      .to.be.revertedWithCustomError(
        crossChainProofValidator,
        "GlobalStateProofSigningAddressInvalid",
      )
      .withArgs(signer3.address);
    await expect(crossChainProofValidator.processIdentityStateProof(isu))
      .to.be.revertedWithCustomError(
        crossChainProofValidator,
        "IdentityStateProofSigningAddressInvalid",
      )
      .withArgs(signer3.address);
  });
});

describe("Oracle signing address validation", function () {
  let CrossChainProofValidatorFactory;
  let crossChainProofValidator;
  let signer, signer2;
  const oracleSigningAddress = "0x1234567890123456789012345678901234567890";
  const contractName = "CrossChainProofValidator";

  before(async function () {
    [signer, signer2] = await ethers.getSigners();
    CrossChainProofValidatorFactory = await ethers.getContractFactory(contractName);
  });

  it("should revert when deploying with zero oracle signing address", async function () {
    await expect(
      CrossChainProofValidatorFactory.deploy("StateInfo", "1", ZeroAddress),
    ).to.be.revertedWithCustomError(
      CrossChainProofValidatorFactory,
      "OracleSigningAddressShouldNotBeZero",
    );
  });

  it("should not revert when deploying with zero legacy oracle signing address", async function () {
    crossChainProofValidator = await CrossChainProofValidatorFactory.deploy(
      "StateInfo",
      "1",
      oracleSigningAddress,
    );
    await crossChainProofValidator.setLegacyOracleSigningAddress(signer2.address);
    await expect(crossChainProofValidator.waitForDeployment()).to.not.be.reverted;
  });

  it("should deploy with correct parameters", async function () {
    crossChainProofValidator = await CrossChainProofValidatorFactory.deploy(
      "StateInfo",
      "1",
      oracleSigningAddress,
    );
    await crossChainProofValidator.waitForDeployment();
    expect(await crossChainProofValidator.getOracleSigningAddress()).to.equal(oracleSigningAddress);
  });

  it("should set a new oracle signing address", async function () {
    await crossChainProofValidator.setOracleSigningAddress(signer.address);
    expect(await crossChainProofValidator.getOracleSigningAddress()).to.equal(signer.address);
    await expect(
      crossChainProofValidator.connect(signer2).setOracleSigningAddress(signer.address),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "OwnableUnauthorizedAccount");
  });

  it("should revert when setting oracle signing address to zero", async function () {
    await expect(
      crossChainProofValidator.setOracleSigningAddress(ZeroAddress),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "OracleSigningAddressShouldNotBeZero",
    );
  });

  it("should set legacy oracle signing address", async function () {
    await crossChainProofValidator.setLegacyOracleSigningAddress(signer.address);
    expect(await crossChainProofValidator.getLegacyOracleSigningAddress()).to.equal(signer.address);
    await expect(
      crossChainProofValidator.connect(signer2).setLegacyOracleSigningAddress(signer.address),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "OwnableUnauthorizedAccount");
    await expect(
      crossChainProofValidator.setLegacyOracleSigningAddress(ZeroAddress),
    ).to.be.revertedWithCustomError(
      crossChainProofValidator,
      "OracleSigningAddressShouldNotBeZero",
    );
  });

  it("should disable legacy oracle signing address", async function () {
    await crossChainProofValidator.disableLegacyOracleSigningAddress();
    expect(await crossChainProofValidator.getLegacyOracleSigningAddress()).to.equal(ZeroAddress);
    await expect(
      crossChainProofValidator.connect(signer2).disableLegacyOracleSigningAddress(),
    ).to.be.revertedWithCustomError(crossChainProofValidator, "OwnableUnauthorizedAccount");
  });
});
