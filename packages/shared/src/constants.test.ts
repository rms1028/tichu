import { describe, it, expect } from 'vitest';
import { createDeck, getCardPoints, normalCard, MAHJONG, DOG, PHOENIX, DRAGON } from './constants.js';

describe('createDeck', () => {
  it('56장 생성', () => {
    expect(createDeck().length).toBe(56);
  });

  it('일반 52장 + 특수 4장', () => {
    const deck = createDeck();
    const normals = deck.filter(c => c.type === 'normal');
    const specials = deck.filter(c => c.type === 'special');
    expect(normals.length).toBe(52);
    expect(specials.length).toBe(4);
  });

  it('총 점수 100점', () => {
    const total = createDeck().reduce((sum, c) => sum + getCardPoints(c), 0);
    expect(total).toBe(100);
  });
});

describe('getCardPoints', () => {
  it('5 = 5점', () => expect(getCardPoints(normalCard('sword', '5'))).toBe(5));
  it('10 = 10점', () => expect(getCardPoints(normalCard('sword', '10'))).toBe(10));
  it('K = 10점', () => expect(getCardPoints(normalCard('sword', 'K'))).toBe(10));
  it('용 = 25점', () => expect(getCardPoints(DRAGON)).toBe(25));
  it('봉황 = -25점', () => expect(getCardPoints(PHOENIX)).toBe(-25));
  it('참새 = 0점', () => expect(getCardPoints(MAHJONG)).toBe(0));
  it('개 = 0점', () => expect(getCardPoints(DOG)).toBe(0));
  it('일반 2 = 0점', () => expect(getCardPoints(normalCard('star', '2'))).toBe(0));
});
