// Battle with Ideas: runtime configuration (AI proxy URL, Firebase web config, data realm).

const q = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

export const CFG = {
  api: q.get('api') || (local ? 'http://127.0.0.1:8964' : 'https://bwi-api.kalakasanyt.workers.dev'),
  realm: q.get('realm') === 'test' ? 'battleIdeasTest' : 'battleIdeas',
  test: q.has('test'),
  firebase: {
    apiKey: 'AIzaSyAaTuELH_mToxH3hRJ4WPIVTECSH7Z8-FY',
    authDomain: 'gzowos-games.firebaseapp.com',
    databaseURL: 'https://gzowos-games-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'gzowos-games',
    storageBucket: 'gzowos-games.firebasestorage.app',
    messagingSenderId: '658227201482',
    appId: '1:658227201482:web:627b44e3c4c2988bc4bb33',
  },
  maxPlayers: 6,
  colors: ['#4c8dff', '#ff9f1c', '#2ec4b6', '#9b5de5', '#ffd23f', '#f15bb5'],
  teamColors: ['#3d7dff', '#ff8a1f'],
  teamNames: ['Blue', 'Orange'],
};
