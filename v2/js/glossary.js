// ========================================
// TAPHOU5E v2 — Glossary
//
// What the numbers and labels on a character sheet mean, in the words you
// would use across a table rather than the words of a rulebook. Shown by the
// hold / hover explainer (wireExplainers in core.js).
//
// Rules follow the 2024 revision of fifth edition. Where it differs from the
// 2014 text -- Exhaustion, Grappled, Invisible, Stunned -- this file follows
// 2024, so do not "correct" those back from an older book.
//
// Each entry is { title, text, points }. `text` is a sentence or two;
// `points` is a short list for things that are a set of separate effects.
// Keep both brief: the bubble is 280px wide and sits over the sheet.
// ========================================

const GLOSSARY = {

    abilities: {
        str: {
            title: 'Strength',
            text: 'Raw physical power.',
            points: [
                'Attack and damage with most melee weapons',
                'Athletics: climbing, jumping, swimming, breaking free of a grapple',
                'Forcing a door, lifting a gate, how much you can carry'
            ]
        },
        dex: {
            title: 'Dexterity',
            text: 'Agility, reflexes and balance.',
            points: [
                'Attack and damage with ranged and finesse weapons',
                'Armor Class in light or no armor, and initiative',
                'Acrobatics, Sleight of Hand and Stealth'
            ]
        },
        con: {
            title: 'Constitution',
            text: 'Health and staying power. No skills use it.',
            points: [
                'Adds to your hit points at every level',
                'Keeping concentration on a spell when you take damage',
                'Shrugging off poison, cold, hunger and forced marches'
            ]
        },
        int: {
            title: 'Intelligence',
            text: 'Memory and reasoning.',
            points: [
                'Arcana, History, Nature and Religion: what you know',
                'Investigation: working things out from clues',
                'Spellcasting for wizards'
            ]
        },
        wis: {
            title: 'Wisdom',
            text: 'Awareness and intuition.',
            points: [
                'Perception and Insight: noticing things and reading people',
                'Survival, Medicine and Animal Handling',
                'Spellcasting for clerics, druids and rangers'
            ]
        },
        cha: {
            title: 'Charisma',
            text: 'Confidence and force of personality.',
            points: [
                'Persuasion, Deception, Intimidation and Performance',
                'Spellcasting for bards, paladins, sorcerers and warlocks'
            ]
        }
    },

    // The lead-in is shared; only the example differs by ability.
    saves: {
        intro: 'A roll to resist something done to you: d20 plus this number, against the DC of the spell, trap or effect.',
        str: 'Resisting being shoved, dragged or pinned in place.',
        dex: 'Getting out of the way: a Fireball, a pit trap, dragon breath.',
        con: 'Enduring poison or cold, and keeping concentration on a spell when hit.',
        int: 'Seeing through an illusion or fending off an attack on your mind.',
        wis: 'Resisting being charmed, frightened or otherwise bent to another will.',
        cha: 'Holding on to who you are: resisting banishment or possession.'
    },

    stats: {
        ac: {
            title: 'Armor Class',
            text: 'How hard you are to hit. An attack roll hits if it equals or beats this number. It comes from your armor, your shield and usually your Dexterity.'
        },
        init: {
            title: 'Initiative',
            text: 'Added to the d20 everyone rolls when a fight starts. The highest total acts first each round. Usually your Dexterity modifier.'
        },
        speed: {
            title: 'Speed',
            text: 'How many feet you can move on your turn. A square on a battle map is 5 feet; difficult terrain costs double.'
        },
        prof: {
            title: 'Proficiency bonus',
            text: 'Added to anything you are trained in: attacks with weapons you know, spell attacks and spell save DCs, and proficient skills and saves. It grows with level: +2, then +3 at 5, +4 at 9, +5 at 13, +6 at 17.'
        },
        pp: {
            title: 'Passive Perception',
            text: 'What you notice without looking for it: 10 plus your Perception bonus. The DM compares it to a hidden creature\'s Stealth roll or a trap\'s DC, without asking you to roll.'
        },
        death: {
            title: 'Death saves',
            text: 'At 0 hit points you roll a d20 at the start of each of your turns, with nothing added.',
            points: [
                '10 or higher is a success, 9 or lower a failure',
                'Three successes and you are stable; three failures and you die',
                'A 20 puts you back up on 1 hit point; a 1 counts as two failures',
                'Taking damage while down is a failure, or two from a critical hit'
            ]
        }
    },

    conditions: {
        Blinded: {
            title: 'Blinded',
            text: 'You cannot see.',
            points: [
                'You fail any check that needs sight',
                'Your attacks have disadvantage',
                'Attacks against you have advantage'
            ]
        },
        Charmed: {
            title: 'Charmed',
            text: 'Someone has won you over, for now.',
            points: [
                'You cannot attack the charmer or target them with anything harmful',
                'The charmer has advantage on checks to talk you round'
            ]
        },
        Deafened: {
            title: 'Deafened',
            text: 'You cannot hear, and fail any check that needs hearing.'
        },
        Frightened: {
            title: 'Frightened',
            text: 'Something has you scared.',
            points: [
                'Disadvantage on attacks and ability checks while you can see the source',
                'You cannot willingly move closer to it'
            ]
        },
        Grappled: {
            title: 'Grappled',
            text: 'Something has hold of you.',
            points: [
                'Your speed is 0',
                'Disadvantage on attacks against anyone but the grappler',
                'The grappler can drag you along when it moves',
                'Break free with an action: Athletics or Acrobatics against its escape DC'
            ]
        },
        Incapacitated: {
            title: 'Incapacitated',
            text: 'You cannot act.',
            points: [
                'No actions, bonus actions or reactions',
                'Your concentration breaks and you cannot speak',
                'Disadvantage on initiative if a fight starts'
            ]
        },
        Invisible: {
            title: 'Invisible',
            text: 'You cannot be seen without magic or a special sense.',
            points: [
                'Your attacks have advantage',
                'Attacks against you have disadvantage',
                'Anything that needs to see its target cannot pick you',
                'Advantage on initiative'
            ]
        },
        Paralyzed: {
            title: 'Paralyzed',
            text: 'You are frozen in place.',
            points: [
                'Incapacitated, and your speed is 0',
                'You fail Strength and Dexterity saves',
                'Attacks against you have advantage',
                'A hit from within 5 feet is a critical hit'
            ]
        },
        Petrified: {
            title: 'Petrified',
            text: 'You and what you carry have turned to stone.',
            points: [
                'Incapacitated, and your speed is 0',
                'You fail Strength and Dexterity saves',
                'Attacks against you have advantage',
                'You resist all damage and cannot be poisoned',
                'You stop ageing and weigh ten times as much'
            ]
        },
        Poisoned: {
            title: 'Poisoned',
            text: 'You have disadvantage on attack rolls and ability checks.'
        },
        Prone: {
            title: 'Prone',
            text: 'You are flat on the ground.',
            points: [
                'You can only crawl, or spend half your speed to stand',
                'Your attacks have disadvantage',
                'Attacks from within 5 feet have advantage against you',
                'Attacks from further away have disadvantage'
            ]
        },
        Restrained: {
            title: 'Restrained',
            text: 'You are tied, webbed or held fast.',
            points: [
                'Your speed is 0',
                'Your attacks have disadvantage',
                'Attacks against you have advantage',
                'Disadvantage on Dexterity saves'
            ]
        },
        Stunned: {
            title: 'Stunned',
            text: 'You are reeling.',
            points: [
                'Incapacitated: no actions, bonus actions or reactions',
                'You fail Strength and Dexterity saves',
                'Attacks against you have advantage'
            ]
        },
        Unconscious: {
            title: 'Unconscious',
            text: 'You are out cold and unaware of what is around you.',
            points: [
                'Incapacitated and prone; you drop what you are holding',
                'Your speed is 0',
                'You fail Strength and Dexterity saves',
                'Attacks against you have advantage',
                'A hit from within 5 feet is a critical hit'
            ]
        },
        Exhaustion: {
            title: 'Exhaustion',
            text: 'It comes in levels, and they stack.',
            points: [
                'Every d20 you roll takes -2 per level',
                'Your speed drops 5 feet per level',
                'At level 6 you die',
                'A long rest removes one level'
            ]
        }
    },

    skills: {
        'Acrobatics':      'Staying on your feet when it is hard to: crossing a narrow ledge, tumbling past someone, keeping your balance on ice or a pitching deck.',
        'Animal Handling': 'Calming, steering or reading an animal: settling a spooked horse, telling whether a dog is about to bite.',
        'Arcana':          'What you know about magic: recognising a spell, a magic item, a strange rune or a creature from another plane.',
        'Athletics':       'Feats of muscle: climbing a cliff, swimming against a current, a long jump, breaking free of a grapple.',
        'Deception':       'Hiding the truth: a convincing lie, a bluff at cards, passing yourself off in a disguise.',
        'History':         'What you know about the past: old wars, lost kingdoms, noble houses, the story behind a ruin.',
        'Insight':         'Reading people: whether someone is lying, what they really want, what they are about to do.',
        'Intimidation':    'Getting your way with threats or a show of force: scaring off a thug, leaning on a prisoner.',
        'Investigation':   'Working things out from clues: finding a hidden compartment, spotting how a trap works, what made a wound.',
        'Medicine':        'Tending the hurt and sick: stabilising a dying friend, working out what illness someone has.',
        'Nature':          'What you know about the wild: plants, animals, weather and terrain, and which mushrooms not to eat.',
        'Perception':      'Noticing things with your senses: a creature hiding, a whisper through a door, a tripwire.',
        'Performance':     'Holding an audience: music, dance, acting, a story well told.',
        'Persuasion':      'Winning people over honestly: negotiating a price, talking a guard round, minding your manners at court.',
        'Religion':        'What you know about gods and faiths: rites, holy symbols, cults and the undead.',
        'Sleight of Hand': 'Quick fingers: picking a pocket, palming a key, slipping something into a drink.',
        'Stealth':         'Not being noticed: hiding, moving quietly, slipping past a guard.',
        'Survival':        'Getting by in the wild: following tracks, finding food and water, navigating, reading the weather.'
    }
};
