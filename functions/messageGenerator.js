// =============================================
//  Motivational Messages — Gender-Based
//  ─────────────────────────────────────
//  25 male + 25 female motivational messages
//  Anti-repeat: never sends same message twice
// =============================================

const FEMALE_MESSAGES = [
    'You got this, queen 💅✨',
    "Don't stop now, you're doing amazing 🌸",
    'Tiny steps today, big wins tomorrow 💖',
    'Stay focused, future you is proud 💫',
    'Finish it and glow differently ✨',
    'No excuses, just progress 💕',
    "You're closer than you think 🌷",
    'One task at a time, babe 💗',
    'Discipline is your superpower 🦋',
    'Make yourself proud today 🌸',
    'Keep going, soft but strong 💫',
    'Slay your tasks like always 👑',
    'Focus now, relax later 🌙',
    "You're building your dream life 💖",
    'Do it for your future self ✨',
    'Progress > perfection 💕',
    'Stay consistent, stay glowing 🌸',
    'Small effort, big glow-up 💫',
    "Don't delay, just start 💗",
    'Your goals need you right now 👑',
    'Calm mind, strong focus 🌷',
    'You can totally finish this 💖',
    'No distractions, just action ✨',
    'Be that girl — disciplined & unstoppable 💅',
    'Finish this and shine brighter 💫',
];

const MALE_MESSAGES = [
    'Stay sharp. Finish what you started. 🔥',
    'Discipline builds kings. Keep going. ⚔️',
    'No excuses. Just results. 💪',
    "You don't quit. You execute. 🎯",
    'One mission. Complete it. 🔥',
    'Focus. Grind. Win. 🧠',
    "You're built for this. Finish strong. 💪",
    'Work now. Celebrate later. 🏆',
    'Stay locked in. No distractions. 🎯',
    'Strength is consistency. Keep moving. ⚡',
    'Be relentless. Finish the task. 🔥',
    'Pressure makes diamonds. Keep pushing. 💎',
    'Control your mind. Execute the plan. 🧠',
    'Winners finish what they start. 🏆',
    'Stay disciplined. Stay dangerous. ⚔️',
    'Action over excuses. Always. 💪',
    'Lock in and dominate. 🔥',
    'Success loves consistency. 📈',
    'Stay focused. Stay unstoppable. ⚡',
    'Do it like a warrior. 🛡️',
    'Progress comes from action. 🎯',
    "Stay strong. Finish today's mission. 💪",
    "You're closer than you think. Push. 🔥",
    'Earn your victory. Complete it. 🏆',
    'Focus wins battles. Stay locked in. ⚔️',
];

// Track last used index per user to avoid consecutive duplicates
const lastUsedIndex = {};

/**
 * Get a random motivational message based on gender.
 * Never repeats the same message consecutively for a user.
 *
 * @param {string} gender - 'male' or 'female'
 * @param {string} userId - user ID for anti-repeat tracking
 * @returns {string} motivational message
 */
function getMotivationalMessage(gender, userId) {
    const messages = gender === 'female' ? FEMALE_MESSAGES : MALE_MESSAGES;
    const key = `${userId}_${gender}`;

    let index;
    do {
        index = Math.floor(Math.random() * messages.length);
    } while (index === lastUsedIndex[key] && messages.length > 1);

    lastUsedIndex[key] = index;
    return messages[index];
}

module.exports = { getMotivationalMessage };
