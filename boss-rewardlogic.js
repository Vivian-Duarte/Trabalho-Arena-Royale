// Função para premiar ou punir o Titã com base no sucesso do ataque
function premiarBot(bot, pontuacao) {
    if (!bot || !bot.isBoss) return;

    bot.acoes[bot.attackState] = (bot.acoes[bot.attackState] || 0) + pontuacao;
    
    // Limite de segurança para a pontuação
    if (bot.acoes[bot.attackState] < -50) bot.acoes[bot.attackState] = -50;
}

function decidirAtaque(bot, now) {
    if (now - bot.lastAttackChange > 3000) {
        let totalScore = Object.values(bot.acoes).reduce((a, b) => a + b, 0);
        let rand = Math.random() * (totalScore + (2.5 * 4)); 
        
        let soma = 0;
        let escolhaEncontrada = false;
        
        for(let state = 0; state < 4; state++) {
            soma += (bot.acoes[state] || 0) + 2.5;
            if(rand <= soma) {
                bot.attackState = state;
                escolhaEncontrada = true;
                break;
            }
        }
        
        if (!escolhaEncontrada) bot.attackState = 0;
        
        console.log("Titã mudou para o ataque:", bot.attackState, "Scores:", bot.acoes);
        bot.lastAttackChange = now;
    }
}