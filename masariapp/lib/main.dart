import 'package:flutter/material.dart';

const ink = Color(0xFF173B31);
const soft = Color(0xFFE5EEE6);
const lime = Color(0xFFD4F28A);
const paper = Color(0xFFF5F5F0);
const muted = Color(0xFF718078);
const line = Color(0xFFE4E8E0);

void main() => runApp(const MasariApp());

class MasariApp extends StatelessWidget {
  const MasariApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Masari | Investing, understood',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: ink, primary: ink),
      scaffoldBackgroundColor: paper,
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontFamily: 'Georgia',
          fontSize: 34,
          height: 1.1,
          fontWeight: FontWeight.w600,
          color: ink,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'Georgia',
          fontSize: 26,
          height: 1.15,
          fontWeight: FontWeight.w600,
          color: ink,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    home: const MasariHome(),
  );
}

class Stock {
  const Stock(
    this.name,
    this.ticker,
    this.price,
    this.change,
    this.description,
    this.color,
  );
  final String name, ticker, description;
  final double price, change;
  final Color color;
}

class Lesson {
  const Lesson(
    this.id,
    this.title,
    this.subtitle,
    this.minutes,
    this.question,
    this.answers,
    this.correct,
    this.feedback,
    this.unlock,
  );
  final String id, title, subtitle, question, feedback, unlock;
  final int minutes, correct;
  final List<String> answers;
}

const lessons = [
  Lesson(
    'stock',
    'What Is a Stock?',
    'Own a tiny piece of a real business.',
    2,
    'When you buy one share of a company, what do you own?',
    [
      'A small ownership share in that company',
      'A guaranteed payment from the company',
      'A loan that the company must pay back',
    ],
    0,
    'A share represents a small ownership stake. Its value can rise or fall as a business and the market change.',
    'Stock search',
  ),
  Lesson(
    'trading',
    'Buying & Selling Stocks',
    'Make a plan before placing an order.',
    3,
    'What should you check before confirming a stock purchase?',
    [
      'Only whether the price went up today',
      'The total cost and how it fits your plan',
      'Whether someone online said it will rise',
    ],
    1,
    'Checking the total cost and your plan helps you make a thoughtful decision. A price move is never guaranteed.',
    'Paper trading',
  ),
  Lesson(
    'market',
    'What Is the Stock Market?',
    'A place where investors trade ownership.',
    2,
    'What happens in a stock market?',
    [
      'Investors buy and sell company shares',
      'Companies promise their shares will gain value',
      'People exchange cash for company products',
    ],
    0,
    'Markets bring buyers and sellers together. Share prices move as people respond to new information and expectations.',
    'Market basics',
  ),
];

const stocks = [
  Stock(
    'Apple',
    'AAPL',
    245.32,
    1.24,
    'Apple designs and sells devices, software, and services used around the world.',
    Color(0xFF41484B),
  ),
  Stock(
    'Microsoft',
    'MSFT',
    428.76,
    .72,
    'Microsoft makes software, cloud services, computers, and productivity tools.',
    Color(0xFF4D8EC8),
  ),
  Stock(
    'Amazon',
    'AMZN',
    212.84,
    -.38,
    'Amazon operates an online marketplace and provides cloud computing services.',
    Color(0xFFE2913A),
  ),
  Stock(
    'Alphabet',
    'GOOGL',
    189.41,
    .91,
    'Alphabet is the parent company of Google and other technology businesses.',
    Color(0xFF648F71),
  ),
  Stock(
    'NVIDIA',
    'NVDA',
    138.85,
    2.15,
    'NVIDIA creates graphics processors and computing platforms for many industries.',
    Color(0xFF78A757),
  ),
  Stock(
    'Tesla',
    'TSLA',
    341.22,
    -1.08,
    'Tesla makes electric vehicles, battery storage, and energy products.',
    Color(0xFFD05B51),
  ),
  Stock(
    'Coca-Cola',
    'KO',
    71.48,
    .26,
    'The Coca-Cola Company sells beverages and owns a portfolio of drink brands.',
    Color(0xFFD25148),
  ),
  Stock(
    "McDonald's",
    'MCD',
    308.17,
    -.21,
    "McDonald's operates restaurants and franchises around the world.",
    Color(0xFFC98D37),
  ),
  Stock(
    'Walmart',
    'WMT',
    96.52,
    .63,
    'Walmart operates retail stores and e-commerce businesses in many countries.',
    Color(0xFF5C8BB7),
  ),
  Stock(
    'Disney',
    'DIS',
    112.73,
    .44,
    'The Walt Disney Company creates entertainment, experiences, and media.',
    Color(0xFF6B74A6),
  ),
];

class Holding {
  const Holding(this.shares, this.cost);
  final int shares;
  final double cost;
}

class MasariHome extends StatefulWidget {
  const MasariHome({super.key});
  @override
  State<MasariHome> createState() => _MasariHomeState();
}

class _MasariHomeState extends State<MasariHome> {
  final nameInput = TextEditingController();
  final searchInput = TextEditingController();
  final done = <String>{};
  final holdings = <String, Holding>{};
  String name = '', query = '', phase = 'read';
  String? lessonId, ticker;
  int tab = 0;
  int? answer;
  double cash = 10000, realized = 0;

  bool get canSearch => done.contains('stock');
  bool get canTrade => done.contains('trading');
  Stock stock(String id) => stocks.firstWhere((s) => s.ticker == id);
  Lesson lesson(String id) => lessons.firstWhere((l) => l.id == id);
  double get invested => holdings.entries.fold(
    0,
    (n, e) => n + stock(e.key).price * e.value.shares,
  );
  double get total => cash + invested;
  double get gain => total - 10000;
  String get nextId => !canSearch
      ? 'stock'
      : !canTrade
      ? 'trading'
      : !done.contains('market')
      ? 'market'
      : 'stock';

  @override
  void dispose() {
    nameInput.dispose();
    searchInput.dispose();
    super.dispose();
  }

  void startLesson(String id) => setState(() {
    lessonId = id;
    phase = 'read';
    answer = null;
  });
  void finishLesson() => setState(() {
    done.add(lessonId!);
    phase = 'done';
  });
  void closeLesson({bool market = false}) => setState(() {
    lessonId = null;
    answer = null;
    if (market) tab = 2;
  });

  @override
  Widget build(BuildContext context) {
    if (name.isEmpty) return welcome();
    return LayoutBuilder(
      builder: (context, box) {
        final wide = box.maxWidth >= 900;
        return Scaffold(
          body: SafeArea(
            child: Row(
              children: [
                if (wide) sideNav(),
                Expanded(
                  child: Column(
                    children: [
                      topBar(),
                      Expanded(
                        child: SingleChildScrollView(
                          padding: EdgeInsets.symmetric(
                            horizontal: wide ? 44 : 18,
                            vertical: 24,
                          ),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 1120),
                              child: content(),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: tab,
                  onDestinationSelected: selectTab,
                  destinations: [
                    const NavigationDestination(
                      icon: Icon(Icons.grid_view_rounded),
                      label: 'Home',
                    ),
                    const NavigationDestination(
                      icon: Icon(Icons.menu_book_rounded),
                      label: 'Learn',
                    ),
                    NavigationDestination(
                      icon: Icon(
                        canSearch
                            ? Icons.show_chart_rounded
                            : Icons.lock_outline_rounded,
                      ),
                      label: 'Market',
                    ),
                    const NavigationDestination(
                      icon: Icon(Icons.account_balance_wallet_outlined),
                      label: 'Portfolio',
                    ),
                  ],
                ),
        );
      },
    );
  }

  Widget welcome() => Scaffold(
    backgroundColor: ink,
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth > 760;
          final copy = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              tag('YOUR FIRST 10,000 VIRTUAL DOLLARS START HERE', color: lime),
              const SizedBox(height: 22),
              const Text(
                'Investing,\nunderstood.',
                style: TextStyle(
                  color: Colors.white,
                  fontFamily: 'Georgia',
                  fontSize: 54,
                  height: 1.03,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Learn the basics. Build your confidence. Make your first move with virtual money.',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 24),
              const SizedBox(
                height: 56,
                child: CustomPaint(painter: _ChartPainter(color: lime)),
              ),
            ],
          );
          final form = Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF20483B),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Set up your practice account',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Start with a name. Your virtual balance is ready.',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: nameInput,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.done,
                  style: const TextStyle(color: Colors.white),
                  onSubmitted: (_) => enter(),
                  decoration: InputDecoration(
                    labelText: 'What should we call you?',
                    labelStyle: const TextStyle(color: Colors.white70),
                    filled: true,
                    fillColor: Colors.white10,
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: .2),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: lime),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: enter,
                    style: FilledButton.styleFrom(
                      backgroundColor: lime,
                      foregroundColor: ink,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'Get started  →',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
          );
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: wide ? 52 : 24,
                  vertical: 24,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    brand(true),
                    if (wide)
                      Row(
                        children: [
                          Expanded(flex: 6, child: copy),
                          const SizedBox(width: 56),
                          Expanded(flex: 4, child: form),
                        ],
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [copy, const SizedBox(height: 24), form],
                      ),
                    const Text(
                      'Practice account only. No real money, ever.',
                      style: TextStyle(color: Colors.white60, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    ),
  );

  void enter() => setState(
    () => name = nameInput.text.trim().isEmpty
        ? 'Investor'
        : nameInput.text.trim(),
  );

  Widget brand([bool dark = false]) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          color: dark ? lime : ink,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          Icons.show_chart_rounded,
          color: dark ? ink : lime,
          size: 20,
        ),
      ),
      const SizedBox(width: 8),
      Text(
        'masari',
        style: TextStyle(
          color: dark ? Colors.white : ink,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    ],
  );

  Widget topBar() => Container(
    height: 66,
    padding: const EdgeInsets.symmetric(horizontal: 20),
    color: Colors.white,
    child: Row(
      children: [
        if (MediaQuery.sizeOf(context).width < 900) brand(),
        const Spacer(),
        const Icon(Icons.spa_outlined, size: 17, color: muted),
        const SizedBox(width: 7),
        const Text(
          'Practice mode',
          style: TextStyle(color: muted, fontSize: 12),
        ),
        const SizedBox(width: 16),
        CircleAvatar(
          radius: 16,
          backgroundColor: soft,
          child: Text(
            name[0].toUpperCase(),
            style: const TextStyle(color: ink, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );

  Widget sideNav() => Container(
    width: 215,
    padding: const EdgeInsets.fromLTRB(14, 24, 12, 20),
    color: Colors.white,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 10, bottom: 32),
          child: brand(),
        ),
        const Padding(
          padding: EdgeInsets.only(left: 10, bottom: 10),
          child: Text(
            'YOUR SPACE',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        for (var i = 0; i < 4; i++)
          ListTile(
            dense: true,
            selected: tab == i,
            selectedTileColor: soft,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            leading: Icon(
              [
                Icons.grid_view_rounded,
                Icons.menu_book_rounded,
                canSearch
                    ? Icons.show_chart_rounded
                    : Icons.lock_outline_rounded,
                Icons.account_balance_wallet_outlined,
              ][i],
              size: 19,
            ),
            title: Text(
              ['Overview', 'Learn', 'Market', 'Portfolio'][i],
              style: const TextStyle(fontSize: 13),
            ),
            onTap: () => selectTab(i),
          ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: soft,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text(
            'Learn first.\nThen make your move.',
            style: TextStyle(
              color: ink,
              fontSize: 12,
              height: 1.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );

  void selectTab(int index) => setState(() {
    tab = index;
    ticker = null;
    lessonId = null;
  });

  Widget content() {
    if (lessonId != null) return lessonPage();
    if (ticker != null) return stockPage(stock(ticker!));
    return switch (tab) {
      1 => learnPage(),
      2 => marketPage(),
      3 => portfolioPage(),
      _ => homePage(),
    };
  }

  Widget homePage() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      eyebrow('YOUR INVESTING PRACTICE'),
      const SizedBox(height: 8),
      Text('Welcome, $name.', style: Theme.of(context).textTheme.headlineLarge),
      const SizedBox(height: 6),
      const Text(
        'Your practice account, all in one place.',
        style: TextStyle(color: muted, fontSize: 14),
      ),
      const SizedBox(height: 22),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          metric(
            'PRACTICE PORTFOLIO',
            money(total),
            Icons.account_balance_wallet_outlined,
          ),
          metric('AVAILABLE CASH', money(cash), Icons.payments_outlined),
          metric(
            'TOTAL RETURN',
            '${gain >= 0 ? '+' : ''}${money(gain)}',
            Icons.trending_up_rounded,
          ),
        ],
      ),
      const SizedBox(height: 18),
      LayoutBuilder(
        builder: (context, c) {
          final left = panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Your learning',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  '${done.length} of 3 lessons complete',
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: done.length / 3,
                  color: ink,
                  backgroundColor: soft,
                  minHeight: 7,
                ),
                const SizedBox(height: 18),
                eyebrow('UP NEXT'),
                const SizedBox(height: 5),
                Text(
                  lesson(nextId).title,
                  style: const TextStyle(
                    color: ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${lesson(nextId).minutes} min · ${lesson(nextId).subtitle}',
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
                const SizedBox(height: 15),
                button('Continue learning', () => startLesson(nextId)),
              ],
            ),
          );
          final right = panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Your portfolio',
                        style: TextStyle(
                          color: ink,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => selectTab(3),
                      child: const Text('See all'),
                    ),
                  ],
                ),
                Text(
                  money(total),
                  style: const TextStyle(
                    color: ink,
                    fontSize: 27,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Text(
                  'Total practice account value',
                  style: TextStyle(color: muted, fontSize: 11),
                ),
                const SizedBox(height: 12),
                if (holdings.isEmpty)
                  const Text(
                    'Your first stock will show up here.',
                    style: TextStyle(color: muted, fontSize: 12),
                  )
                else
                  ...holdings.entries
                      .take(3)
                      .map((e) => holdingRow(stock(e.key), e.value)),
                if (holdings.isEmpty)
                  TextButton.icon(
                    onPressed: () => selectTab(2),
                    icon: const Icon(Icons.lock_outline, size: 16),
                    label: const Text('Explore market'),
                  ),
              ],
            ),
          );
          return c.maxWidth < 720
              ? Column(children: [left, const SizedBox(height: 12), right])
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: left),
                    const SizedBox(width: 12),
                    Expanded(child: right),
                  ],
                );
        },
      ),
      const SizedBox(height: 18),
      notice(),
    ],
  );

  Widget learnPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      eyebrow('THE LEARNING PATH'),
      const SizedBox(height: 8),
      Text(
        'Learn the language\nof investing.',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 8),
      const Text(
        'Short lessons. Useful ideas. No jargon required.',
        style: TextStyle(color: muted),
      ),
      const SizedBox(height: 18),
      panel(
        child: Row(
          children: [
            const Icon(Icons.key_rounded, color: ink),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Your skills unlock new tools',
                style: TextStyle(color: ink, fontWeight: FontWeight.w700),
              ),
            ),
            Text(
              canSearch ? '✓ Search' : '🔒 Search',
              style: const TextStyle(color: muted, fontSize: 11),
            ),
            const SizedBox(width: 10),
            Text(
              canTrade ? '✓ Trade' : '🔒 Trade',
              style: const TextStyle(color: muted, fontSize: 11),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (var i = 0; i < lessons.length; i++)
        Padding(
          padding: const EdgeInsets.only(bottom: 9),
          child: lessonCard(lessons[i], i + 1),
        ),
      notice(),
    ],
  );

  Widget lessonCard(Lesson l, int i) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(8),
    child: InkWell(
      onTap: () => startLesson(l.id),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: [
                  const Color(0xFFE9F2D5),
                  const Color(0xFFFFE7D8),
                  const Color(0xFFE5EAF5),
                ][i - 1],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                [
                  Icons.pie_chart_outline_rounded,
                  Icons.swap_horiz_rounded,
                  Icons.storefront_outlined,
                ][i - 1],
                color: ink,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '$i'.padLeft(2, '0'),
              style: const TextStyle(color: muted, fontSize: 10),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l.title,
                    style: const TextStyle(
                      color: ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    l.subtitle,
                    style: const TextStyle(color: muted, fontSize: 11),
                  ),
                ],
              ),
            ),
            Text(
              done.contains(l.id) ? 'Complete' : '${l.minutes} min',
              style: const TextStyle(color: muted, fontSize: 11),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.arrow_forward_ios_rounded, size: 13, color: muted),
          ],
        ),
      ),
    ),
  );

  Widget lessonPage() {
    final l = lesson(lessonId!);
    if (phase == 'done') {
      return panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.check_circle_rounded, color: ink, size: 42),
            const SizedBox(height: 16),
            eyebrow('LESSON COMPLETE'),
            const SizedBox(height: 7),
            Text(
              'That’s a smart first step.',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 10),
            Text(l.feedback, style: const TextStyle(color: muted, height: 1.6)),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: soft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${l.unlock} unlocked',
                style: const TextStyle(color: ink, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: 16),
            button(
              l.id == 'trading' ? 'Start paper trading' : 'Explore the market',
              () => closeLesson(market: true),
            ),
          ],
        ),
      );
    }
    if (phase == 'quiz' || phase == 'wrong') {
      return panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            eyebrow('CHECK YOUR UNDERSTANDING'),
            const SizedBox(height: 12),
            Text(l.question, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 18),
            for (var i = 0; i < l.answers.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: answerOption(l.answers[i], i),
              ),
            if (phase == 'wrong')
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Not quite. Take another look and try again.',
                  style: TextStyle(color: Color(0xFFB34F43)),
                ),
              ),
            const SizedBox(height: 14),
            button(
              'Check answer',
              answer == null
                  ? null
                  : () {
                      if (answer == l.correct) {
                        finishLesson();
                      } else {
                        setState(() => phase = 'wrong');
                      }
                    },
            ),
          ],
        ),
      );
    }
    final explainer = l.id == 'stock'
        ? 'When a company divides its ownership into shares, each share is a tiny stake in that business. If you own a share, you are one of its owners. You can also lose money if its value falls.'
        : l.id == 'trading'
        ? 'Before buying, know the share price, how many shares you want, and the total cost. Prices move up and down, so only invest money you can afford to leave invested.'
        : 'Markets bring buyers and sellers together. Companies offer shares, then investors trade with one another. Prices can rise or fall as expectations change.';
    return panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              eyebrow('QUICK LESSON'),
              const Spacer(),
              Text('${l.minutes} min', style: const TextStyle(color: muted)),
            ],
          ),
          const SizedBox(height: 12),
          Text(l.title, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(l.subtitle, style: const TextStyle(color: muted)),
          const SizedBox(height: 18),
          Container(
            height: 128,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: l.id == 'stock'
                  ? const Color(0xFFE9F2D5)
                  : const Color(0xFFFFE7D8),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  l.id == 'stock'
                      ? Icons.pie_chart_outline_rounded
                      : l.id == 'trading'
                      ? Icons.swap_horiz_rounded
                      : Icons.storefront_outlined,
                  color: ink,
                  size: 38,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    l.id == 'stock'
                        ? 'A small piece of something bigger.'
                        : l.id == 'trading'
                        ? 'Price × shares = total cost.'
                        : 'Buyers meet sellers.',
                    style: const TextStyle(
                      color: ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text(explainer, style: const TextStyle(color: muted, height: 1.65)),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF9ECDC),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              l.id == 'stock'
                  ? 'Example: owning one share of a bike company means you own a very small part of that business, not a bike.'
                  : l.id == 'trading'
                  ? 'Example: at 20 dollars a share, three shares cost 60 dollars before any fees.'
                  : 'A market is not a guarantee. Past performance does not predict future results.',
              style: const TextStyle(
                color: Color(0xFF785534),
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ),
          const SizedBox(height: 18),
          button(
            'Take the quick quiz',
            () => setState(() {
              phase = 'quiz';
              answer = null;
            }),
          ),
        ],
      ),
    );
  }

  Widget answerOption(String text, int index) => InkWell(
    onTap: () => setState(() => answer = index),
    borderRadius: BorderRadius.circular(8),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: answer == index ? soft : Colors.white,
        border: Border.all(color: answer == index ? ink : line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 13,
            backgroundColor: answer == index ? ink : paper,
            child: Text(
              String.fromCharCode(65 + index),
              style: TextStyle(
                color: answer == index ? Colors.white : muted,
                fontSize: 10,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(color: ink, fontSize: 13)),
          ),
          if (answer == index)
            const Icon(Icons.check_circle, size: 18, color: ink),
        ],
      ),
    ),
  );

  Widget marketPage() {
    final filtered = stocks
        .where(
          (s) => '${s.name} ${s.ticker}'.toLowerCase().contains(
            query.toLowerCase(),
          ),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        eyebrow('THE PRACTICE MARKET'),
        const SizedBox(height: 8),
        Text(
          'Explore companies.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 6),
        const Text(
          'Sample prices for learning. No real trades take place.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 18),
        if (!canSearch)
          panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.lock_outline_rounded, color: ink, size: 28),
                const SizedBox(height: 14),
                Text(
                  'One quick lesson opens the market.',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Learn what a share represents, then search familiar companies with your virtual account.',
                  style: TextStyle(color: muted, height: 1.5),
                ),
                const SizedBox(height: 16),
                button('Start “What Is a Stock?”', () => startLesson('stock')),
              ],
            ),
          )
        else ...[
          TextField(
            controller: searchInput,
            onChanged: (v) => setState(() => query = v),
            decoration: InputDecoration(
              hintText: 'Search a company or ticker',
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: line),
              ),
            ),
          ),
          const SizedBox(height: 13),
          for (final s in filtered)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: stockRow(s, () => setState(() => ticker = s.ticker)),
            ),
          if (filtered.isEmpty)
            const Text(
              'No companies found. Try a name or ticker.',
              style: TextStyle(color: muted),
            ),
        ],
        const SizedBox(height: 14),
        notice(),
      ],
    );
  }

  Widget stockRow(Stock s, VoidCallback onTap) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(8),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            companyMark(s),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.name,
                    style: const TextStyle(
                      color: ink,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    s.ticker,
                    style: const TextStyle(color: muted, fontSize: 11),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  money(s.price),
                  style: const TextStyle(
                    color: ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                Text(
                  '${s.change >= 0 ? '+' : ''}${s.change.toStringAsFixed(2)}%',
                  style: TextStyle(
                    color: s.change >= 0 ? ink : Colors.deepOrange,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 12),
            const Icon(Icons.arrow_forward_ios_rounded, color: muted, size: 13),
          ],
        ),
      ),
    ),
  );

  Widget stockPage(Stock s) {
    final h = holdings[s.ticker];
    final positionGain = h == null ? 0.0 : s.price * h.shares - h.cost;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          onPressed: () => setState(() => ticker = null),
          icon: const Icon(Icons.arrow_back_rounded),
          label: const Text('Back to companies'),
        ),
        panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  companyMark(s, 48),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.name,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        Text(s.ticker, style: const TextStyle(color: muted)),
                      ],
                    ),
                  ),
                  tag('SAMPLE QUOTE'),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                money(s.price),
                style: const TextStyle(
                  color: ink,
                  fontSize: 34,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                '${s.change >= 0 ? '+' : ''}${s.change.toStringAsFixed(2)}% sample daily change',
                style: const TextStyle(color: muted, fontSize: 12),
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 150,
                width: double.infinity,
                child: CustomPaint(painter: _ChartPainter(color: s.color)),
              ),
              const SizedBox(height: 14),
              Text(
                s.description,
                style: const TextStyle(color: muted, height: 1.5),
              ),
              if (h != null)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Text(
                    'Your position: ${h.shares} shares  ·  ${positionGain >= 0 ? '+' : ''}${money(positionGain)}',
                    style: const TextStyle(
                      color: ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              const SizedBox(height: 18),
              if (!canTrade)
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => startLesson('trading'),
                    icon: const Icon(Icons.lock_outline_rounded),
                    label: const Text(
                      'Learn how trading works to unlock orders',
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: ink,
                      padding: const EdgeInsets.all(14),
                    ),
                  ),
                )
              else
                Row(
                  children: [
                    Expanded(child: button('Buy', () => order(s, true))),
                    if (h != null) ...[
                      const SizedBox(width: 9),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => order(s, false),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.all(14),
                            foregroundColor: ink,
                          ),
                          child: const Text('Sell'),
                        ),
                      ),
                    ],
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        notice(),
      ],
    );
  }

  Future<void> order(Stock s, bool buying) async {
    final max = buying
        ? (cash / s.price).floor()
        : holdings[s.ticker]?.shares ?? 0;
    var count = 1;
    final result = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) {
          final cost = count * s.price;
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                22,
                18,
                22,
                24 + MediaQuery.viewInsetsOf(ctx).bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 38,
                      height: 4,
                      decoration: BoxDecoration(
                        color: line,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '${buying ? 'Buy' : 'Sell'} ${s.ticker}',
                    style: Theme.of(ctx).textTheme.headlineMedium,
                  ),
                  Text(
                    'Sample price  ${money(s.price)} per share',
                    style: const TextStyle(color: muted),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Number of shares',
                          style: TextStyle(color: ink),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Remove one share',
                        onPressed: count > 1
                            ? () => update(() => count--)
                            : null,
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      Text(
                        '$count',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                        ),
                      ),
                      IconButton(
                        tooltip: 'Add one share',
                        onPressed: count < max
                            ? () => update(() => count++)
                            : null,
                        icon: const Icon(Icons.add_circle_outline),
                      ),
                    ],
                  ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: paper,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Estimated total',
                                style: TextStyle(color: muted),
                              ),
                            ),
                            Text(
                              money(cost),
                              style: const TextStyle(
                                color: ink,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        if (buying)
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Cash after purchase',
                                  style: TextStyle(color: muted, fontSize: 11),
                                ),
                              ),
                              Text(
                                money(cash - cost),
                                style: const TextStyle(
                                  color: ink,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: max > 0 && count <= max
                          ? () => Navigator.pop(ctx, count)
                          : null,
                      child: Text('Confirm ${buying ? 'purchase' : 'sale'}'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      final prior = holdings[s.ticker];
      if (buying) {
        cash -= s.price * result;
        holdings[s.ticker] = Holding(
          (prior?.shares ?? 0) + result,
          (prior?.cost ?? 0) + s.price * result,
        );
      } else {
        final soldCost = prior!.cost * result / prior.shares;
        cash += s.price * result;
        realized += s.price * result - soldCost;
        if (result == prior.shares) {
          holdings.remove(s.ticker);
        } else {
          holdings[s.ticker] = Holding(
            prior.shares - result,
            prior.cost - soldCost,
          );
        }
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '${buying ? 'Bought' : 'Sold'} $result ${s.ticker} share${result == 1 ? '' : 's'} with virtual cash',
        ),
      ),
    );
  }

  Widget portfolioPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      eyebrow('YOUR PAPER PORTFOLIO'),
      const SizedBox(height: 8),
      Text(
        'Every move,\nall in one view.',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 18),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          metric(
            'PORTFOLIO VALUE',
            money(total),
            Icons.account_balance_wallet_outlined,
          ),
          metric(
            'TOTAL RETURN',
            '${gain >= 0 ? '+' : ''}${money(gain)}  ·  ${(gain / 10000 * 100).toStringAsFixed(2)}%',
            Icons.trending_up_rounded,
          ),
          metric('AVAILABLE CASH', money(cash), Icons.payments_outlined),
        ],
      ),
      const SizedBox(height: 16),
      panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Your holdings',
                    style: TextStyle(
                      color: ink,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  '${holdings.length} companies',
                  style: const TextStyle(color: muted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (holdings.isEmpty)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Complete a lesson to unlock stock search and make your first practice trade.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, height: 1.5),
                  ),
                ),
              )
            else ...[
              const Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Text(
                      'COMPANY',
                      style: TextStyle(color: muted, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'SHARES',
                      textAlign: TextAlign.right,
                      style: TextStyle(color: muted, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      'VALUE',
                      textAlign: TextAlign.right,
                      style: TextStyle(color: muted, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      'GAIN / LOSS',
                      textAlign: TextAlign.right,
                      style: TextStyle(color: muted, fontSize: 9),
                    ),
                  ),
                ],
              ),
              for (final e in holdings.entries)
                portfolioRow(stock(e.key), e.value),
              const Divider(color: line),
              Row(
                children: [
                  const Expanded(
                    child: Text('Cash', style: TextStyle(color: muted)),
                  ),
                  Text(
                    money(cash),
                    style: const TextStyle(
                      color: ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (realized != 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Realized gain / loss',
                          style: TextStyle(color: muted),
                        ),
                      ),
                      Text('${realized >= 0 ? '+' : ''}${money(realized)}'),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 14),
      notice(),
    ],
  );

  Widget portfolioRow(Stock s, Holding h) {
    final diff = s.price * h.shares - h.cost;
    return InkWell(
      onTap: () => setState(() {
        ticker = s.ticker;
        tab = 2;
      }),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Row(
                children: [
                  companyMark(s, 30),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.name,
                          style: const TextStyle(
                            color: ink,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          s.ticker,
                          style: const TextStyle(color: muted, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: Text('${h.shares}', textAlign: TextAlign.right)),
            Expanded(
              flex: 2,
              child: Text(
                money(s.price * h.shares),
                textAlign: TextAlign.right,
              ),
            ),
            Expanded(
              flex: 2,
              child: Text(
                '${diff >= 0 ? '+' : ''}${money(diff)}',
                textAlign: TextAlign.right,
                style: TextStyle(
                  color: diff >= 0 ? ink : Colors.deepOrange,
                  fontSize: 10,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget holdingRow(Stock s, Holding h) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      children: [
        companyMark(s, 30),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            '${s.ticker} · ${h.shares} shares',
            style: const TextStyle(
              color: ink,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Text(
          money(s.price * h.shares),
          style: const TextStyle(
            color: ink,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ],
    ),
  );

  Widget companyMark(Stock s, [double size = 38]) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: s.color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      s.ticker[0],
      style: TextStyle(
        color: s.color,
        fontSize: size * .4,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
  Widget metric(String label, String value, IconData icon) => SizedBox(
    width: 250,
    child: panel(
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: soft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: ink, size: 19),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: muted,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .4,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: const TextStyle(
                    color: ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
  Widget panel({required Widget child}) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: line),
      borderRadius: BorderRadius.circular(8),
    ),
    child: child,
  );
  Widget button(String label, VoidCallback? action) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: action,
      style: FilledButton.styleFrom(
        backgroundColor: ink,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: Text(label),
    ),
  );
  Widget eyebrow(String label) => Text(
    label.toUpperCase(),
    style: const TextStyle(
      color: muted,
      fontSize: 9,
      letterSpacing: 1,
      fontWeight: FontWeight.w700,
    ),
  );
  Widget tag(String label, {Color color = paper}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      label,
      style: const TextStyle(
        color: ink,
        fontSize: 9,
        letterSpacing: .5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
  Widget notice() => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: const Color(0xFFF9ECDC),
      borderRadius: BorderRadius.circular(8),
    ),
    child: const Row(
      children: [
        Icon(Icons.info_outline_rounded, color: Color(0xFF9A6332), size: 17),
        SizedBox(width: 9),
        Expanded(
          child: Text(
            'Sample prices for learning only. This is a simulation, not financial advice.',
            style: TextStyle(color: Color(0xFF785534), fontSize: 11),
          ),
        ),
      ],
    ),
  );
}

class _ChartPainter extends CustomPainter {
  const _ChartPainter({required this.color});
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 1; i < 4; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        Paint()..color = line,
      );
    }
    final points = [
      Offset(0, size.height * .75),
      Offset(size.width * .13, size.height * .58),
      Offset(size.width * .25, size.height * .68),
      Offset(size.width * .37, size.height * .4),
      Offset(size.width * .51, size.height * .49),
      Offset(size.width * .65, size.height * .27),
      Offset(size.width * .78, size.height * .34),
      Offset(size.width, size.height * .12),
    ];
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (final p in points.skip(1)) {
      path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(points.last, 4, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _ChartPainter old) => old.color != color;
}

String money(double value) =>
    '\$${value.toStringAsFixed(2).replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',')}';
