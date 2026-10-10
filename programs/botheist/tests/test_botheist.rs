use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    botheist::{CreateCampaignArgs, RewardInput},
    litesvm::LiteSVM,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const SOL: u64 = 1_000_000_000;
const START: i64 = 1_790_000_000;
const CLOSE: i64 = START + 3_600;
const DEADLINE: i64 = CLOSE + 3_600;

struct Env {
    svm: LiteSVM,
    organizer: Keypair,
    verifier: Keypair,
    winner: Keypair,
    campaign_id: [u8; 16],
}

fn rent_min(svm: &LiteSVM) -> u64 {
    svm.minimum_balance_for_rent_exemption(0)
}

fn set_time(svm: &mut LiteSVM, ts: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.set_sysvar::<Clock>(&clock);
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/botheist.so"));
    svm.add_program(botheist::id(), bytes).unwrap();
    set_time(&mut svm, START);
    let organizer = Keypair::new();
    let verifier = Keypair::new();
    let winner = Keypair::new();
    svm.airdrop(&organizer.pubkey(), 20 * SOL).unwrap();
    svm.airdrop(&verifier.pubkey(), SOL).unwrap();
    svm.airdrop(&winner.pubkey(), SOL).unwrap();
    Env { svm, organizer, verifier, winner, campaign_id: [7u8; 16] }
}

fn campaign_pda(organizer: &Pubkey, id: &[u8; 16]) -> Pubkey {
    Pubkey::find_program_address(&[botheist::CAMPAIGN_SEED, organizer.as_ref(), id], &botheist::id()).0
}

fn vault_pda(campaign: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[botheist::VAULT_SEED, campaign.as_ref()], &botheist::id()).0
}

fn claim_pda(campaign: &Pubkey, rule_id: u8) -> Pubkey {
    Pubkey::find_program_address(&[botheist::CLAIM_SEED, campaign.as_ref(), &[rule_id]], &botheist::id()).0
}

fn send(svm: &mut LiteSVM, ix: Instruction, payer: &Keypair, signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.meta.logs))
}

fn default_args(env: &Env) -> CreateCampaignArgs {
    CreateCampaignArgs {
        campaign_id: env.campaign_id,
        verifier: env.verifier.pubkey(),
        config_hash: [9u8; 32],
        rewards: vec![
            RewardInput { rule_id: 0, amount: SOL / 2 },
            RewardInput { rule_id: 1, amount: SOL / 4 },
            RewardInput { rule_id: 2, amount: SOL / 4 },
        ],
        submissions_close_at: CLOSE,
        payout_deadline_at: DEADLINE,
    }
}

fn create_ix(env: &Env, args: CreateCampaignArgs) -> Instruction {
    let campaign = campaign_pda(&env.organizer.pubkey(), &args.campaign_id);
    Instruction::new_with_bytes(
        botheist::id(),
        &botheist::instruction::CreateAndFundCampaign { args }.data(),
        botheist::accounts::CreateAndFundCampaign {
            organizer: env.organizer.pubkey(),
            campaign,
            vault: vault_pda(&campaign),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn create(env: &mut Env) -> Pubkey {
    let ix = create_ix(env, default_args(env));
    let organizer = env.organizer.insecure_clone();
    send(&mut env.svm, ix, &organizer, &[&organizer]).unwrap();
    campaign_pda(&env.organizer.pubkey(), &env.campaign_id)
}

fn award_ix(campaign: Pubkey, verifier: &Pubkey, winner: &Pubkey, rule_id: u8) -> Instruction {
    Instruction::new_with_bytes(
        botheist::id(),
        &botheist::instruction::Award { rule_id, run_id: [3u8; 16], proof_hash: [5u8; 32] }.data(),
        botheist::accounts::Award {
            verifier: *verifier,
            campaign,
            vault: vault_pda(&campaign),
            claim: claim_pda(&campaign, rule_id),
            winner: *winner,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn award(env: &mut Env, campaign: Pubkey, rule_id: u8) -> Result<(), String> {
    let verifier = env.verifier.insecure_clone();
    let ix = award_ix(campaign, &verifier.pubkey(), &env.winner.pubkey(), rule_id);
    send(&mut env.svm, ix, &verifier, &[&verifier])
}

fn refund_ix(campaign: Pubkey, organizer: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        botheist::id(),
        &botheist::instruction::Refund {}.data(),
        botheist::accounts::Refund {
            organizer: *organizer,
            campaign,
            vault: vault_pda(&campaign),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn load_campaign(svm: &LiteSVM, campaign: &Pubkey) -> botheist::Campaign {
    let acc = svm.get_account(campaign).unwrap();
    botheist::Campaign::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    svm.get_balance(key).unwrap_or(0)
}

#[test]
fn creates_and_funds_campaign_in_one_transaction() {
    let mut env = setup();
    let campaign = create(&mut env);
    let state = load_campaign(&env.svm, &campaign);
    assert_eq!(state.organizer, env.organizer.pubkey());
    assert_eq!(state.verifier, env.verifier.pubkey());
    assert_eq!(state.total_funded, SOL);
    assert_eq!(state.reward_count, 3);
    assert_eq!(state.config_hash, [9u8; 32]);
    assert!(!state.closed);
    assert_eq!(balance(&env.svm, &vault_pda(&campaign)), SOL + rent_min(&env.svm));
}

#[test]
fn rejects_invalid_campaign_terms() {
    let mut env = setup();
    let organizer = env.organizer.insecure_clone();
    let cases: Vec<Box<dyn Fn(&mut CreateCampaignArgs)>> = vec![
        Box::new(|a| a.rewards.clear()),
        Box::new(|a| a.rewards[0].amount = 0),
        Box::new(|a| a.rewards[1].rule_id = 0),
        Box::new(|a| a.submissions_close_at = START - 1),
        Box::new(|a| a.payout_deadline_at = a.submissions_close_at),
        Box::new(|a| a.verifier = Pubkey::default()),
    ];
    for (i, mutate) in cases.iter().enumerate() {
        let mut args = default_args(&env);
        args.campaign_id = [i as u8 + 100; 16];
        mutate(&mut args);
        let ix = create_ix(&env, args);
        assert!(send(&mut env.svm, ix, &organizer, &[&organizer]).is_err(), "case {i} should fail");
    }
}

#[test]
fn verifier_pays_the_fixed_reward_and_records_the_claim() {
    let mut env = setup();
    let campaign = create(&mut env);
    let before = balance(&env.svm, &env.winner.pubkey());
    award(&mut env, campaign, 0).unwrap();
    assert_eq!(balance(&env.svm, &env.winner.pubkey()), before + SOL / 2);

    let acc = env.svm.get_account(&claim_pda(&campaign, 0)).unwrap();
    let claim = botheist::Claim::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(claim.winner, env.winner.pubkey());
    assert_eq!(claim.amount, SOL / 2);
    assert_eq!(claim.proof_hash, [5u8; 32]);
    assert_eq!(claim.run_id, [3u8; 16]);

    let state = load_campaign(&env.svm, &campaign);
    assert_eq!(state.total_paid, SOL / 2);
    assert!(state.rewards[0].claimed);
    assert!(!state.rewards[1].claimed);
}

#[test]
fn the_same_rule_cannot_be_paid_twice() {
    let mut env = setup();
    let campaign = create(&mut env);
    award(&mut env, campaign, 0).unwrap();
    let after_first = balance(&env.svm, &env.winner.pubkey());

    // A different winner for the same rule is refused too.
    let other = Keypair::new();
    env.svm.airdrop(&other.pubkey(), SOL).unwrap();
    let verifier = env.verifier.insecure_clone();
    let ix = award_ix(campaign, &verifier.pubkey(), &other.pubkey(), 0);
    assert!(send(&mut env.svm, ix, &verifier, &[&verifier]).is_err());
    assert!(award(&mut env, campaign, 0).is_err());
    assert_eq!(balance(&env.svm, &env.winner.pubkey()), after_first);

    // Other rules remain open.
    award(&mut env, campaign, 1).unwrap();
}

#[test]
fn only_the_campaign_verifier_can_award() {
    let mut env = setup();
    let campaign = create(&mut env);
    let impostor = Keypair::new();
    env.svm.airdrop(&impostor.pubkey(), SOL).unwrap();
    let ix = award_ix(campaign, &impostor.pubkey(), &env.winner.pubkey(), 0);
    assert!(send(&mut env.svm, ix, &impostor, &[&impostor]).is_err());
    let organizer = env.organizer.insecure_clone();
    let ix = award_ix(campaign, &organizer.pubkey(), &env.winner.pubkey(), 0);
    assert!(send(&mut env.svm, ix, &organizer, &[&organizer]).is_err());
    assert!(env.svm.get_account(&claim_pda(&campaign, 0)).is_none());
}

#[test]
fn unknown_rules_and_vault_as_winner_are_refused() {
    let mut env = setup();
    let campaign = create(&mut env);
    assert!(award(&mut env, campaign, 7).is_err());
    let verifier = env.verifier.insecure_clone();
    let ix = award_ix(campaign, &verifier.pubkey(), &vault_pda(&campaign), 0);
    assert!(send(&mut env.svm, ix, &verifier, &[&verifier]).is_err());
}

#[test]
fn awards_stop_after_the_payout_deadline() {
    let mut env = setup();
    let campaign = create(&mut env);
    set_time(&mut env.svm, CLOSE + 10);
    award(&mut env, campaign, 0).unwrap(); // processing period: still allowed
    set_time(&mut env.svm, DEADLINE + 1);
    assert!(award(&mut env, campaign, 1).is_err());
}

#[test]
fn organizer_cannot_withdraw_early_but_gets_the_rest_after_the_deadline() {
    let mut env = setup();
    let campaign = create(&mut env);
    let organizer = env.organizer.insecure_clone();
    assert!(send(&mut env.svm, refund_ix(campaign, &organizer.pubkey()), &organizer, &[&organizer]).is_err());
    set_time(&mut env.svm, CLOSE + 1);
    assert!(send(&mut env.svm, refund_ix(campaign, &organizer.pubkey()), &organizer, &[&organizer]).is_err());

    award(&mut env, campaign, 0).unwrap();
    set_time(&mut env.svm, DEADLINE + 1);
    let before = balance(&env.svm, &organizer.pubkey());
    send(&mut env.svm, refund_ix(campaign, &organizer.pubkey()), &organizer, &[&organizer]).unwrap();
    let returned = SOL / 2 + rent_min(&env.svm);
    assert_eq!(balance(&env.svm, &organizer.pubkey()), before + returned - 5_000);
    assert_eq!(balance(&env.svm, &vault_pda(&campaign)), 0);
    assert!(load_campaign(&env.svm, &campaign).closed);

    // A closed campaign cannot be refunded twice.
    assert!(send(&mut env.svm, refund_ix(campaign, &organizer.pubkey()), &organizer, &[&organizer]).is_err());
}

#[test]
fn someone_else_cannot_refund_the_vault() {
    let mut env = setup();
    let campaign = create(&mut env);
    set_time(&mut env.svm, DEADLINE + 1);
    let thief = Keypair::new();
    env.svm.airdrop(&thief.pubkey(), SOL).unwrap();
    assert!(send(&mut env.svm, refund_ix(campaign, &thief.pubkey()), &thief, &[&thief]).is_err());
    assert_eq!(balance(&env.svm, &vault_pda(&campaign)), SOL + rent_min(&env.svm));
}
