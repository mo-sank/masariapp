// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:masariapp/main.dart';

void main() {
  testWidgets('lesson unlocks search and paper trading updates portfolio', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MasariApp());
    await tester.enterText(find.byType(TextField), 'Nazir');
    await tester.tap(find.text('Get started  →'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome, Nazir.'), findsOneWidget);
    await tester.tap(find.text('Continue learning'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take the quick quiz'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A small ownership share in that company'));
    await tester.pump();
    await tester.tap(find.text('Check answer'));
    await tester.pumpAndSettle();

    expect(find.text('Stock search unlocked'), findsOneWidget);
    await tester.tap(find.text('Explore the market'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Apple');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apple').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Learn how trading works to unlock orders'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take the quick quiz'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The total cost and how it fits your plan'));
    await tester.pump();
    await tester.tap(find.text('Check answer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start paper trading'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apple').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buy'));
    await tester.pumpAndSettle();

    for (var i = 0; i < 4; i++) {
      await tester.tap(find.byTooltip('Add one share'));
      await tester.pump();
    }
    await tester.tap(find.text('Confirm purchase'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Portfolio').last);
    await tester.pumpAndSettle();

    expect(find.text('AAPL'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    expect(find.text(r'$8,773.40'), findsNWidgets(2));
  });
}
