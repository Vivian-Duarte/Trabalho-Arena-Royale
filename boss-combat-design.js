class BossCombatDesign {
    constructor(bossEntity) {
        this.boss = bossEntity;
        this.currentPhase = 1;
    }

    updatePhase(currentHealth, maxHealth) {
        const healthPercentage = (currentHealth / maxHealth) * 100;

        if (healthPercentage > 70) {
            this.setPhaseOne();
        } else if (healthPercentage > 40) {
            this.setPhaseTwo();
        } else if (healthPercentage > 15) {
            this.setPhaseThree();
        } else {
            this.setPhaseFour();
        }
    }

    setPhaseOne() {
        if (this.currentPhase === 1) return;
        this.currentPhase = 1;
        this.boss.speed = this.boss.baseSpeed * 0.8;
        this.boss.size = this.boss.baseSize * 1.5;
        this.boss.lifeStealRate = 0;
    }

    setPhaseTwo() {
        if (this.currentPhase === 2) return;
        this.currentPhase = 2;
        this.boss.speed = this.boss.baseSpeed * 1.2;
        this.boss.size = this.boss.baseSize * 1.0;
        this.boss.lifeStealRate = 0;
    }

    setPhaseThree() {
        if (this.currentPhase === 3) return;
        this.currentPhase = 3;
        this.boss.speed = this.boss.baseSpeed * 1.6;
        this.boss.size = this.boss.baseSize * 0.6;
        this.boss.lifeStealRate = 0;
    }

    setPhaseFour() {
        if (this.currentPhase === 4) return;
        this.currentPhase = 4;
        this.boss.speed = this.boss.baseSpeed * 2.2;
        this.boss.size = this.boss.baseSize * 0.6;
        this.boss.lifeStealRate = 0.05;
    }

    calculatePredictiveDodge(projectiles, difficultyMultiplier) {
        const dodgeChance = this.currentPhase * 0.20 * difficultyMultiplier;

        if (Math.random() > dodgeChance) return null;

        for (let proj of projectiles) {
            const isIncoming = this.checkTrajectoryIntersection(proj, this.boss);
            if (isIncoming) {
                return this.getLateralEscapeVector(proj.velocity);
            }
        }
        return null;
    }

    checkTrajectoryIntersection(projectile, entity) {
        // Lógica de projeção do vetor do projétil contra a HitBox (Raio) da Entidade
        return true; 
    }

    getLateralEscapeVector(projectileVelocity) {
        // Inverte os eixos para gerar o vetor normal (esquiva lateral de 90 graus)
        return { x: -projectileVelocity.y, y: projectileVelocity.x };
    }
}